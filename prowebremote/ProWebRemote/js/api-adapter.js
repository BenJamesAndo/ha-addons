/**
 * ProPresenter API Adapter
 * 
 * Provides a unified interface for both Classic WebSocket API and OpenAPI
 * This adapter allows seamless switching between API types without modifying site.js
 */

var ProPresenterAPI = (function() {
    'use strict';

    // Private variables
    var wsConnection = null;
    var wsUri = null;
    var isOpenAPI = (typeof apiType !== 'undefined' && apiType === 'open');
    var baseURL = '';
    var openAPIPollingInterval = null;
    var lastSlideIndex = -1;
    var lastPresentationUUID = null;
    var presentationCache = {}; // Cache presentations by UUID
    var pendingPresentationRequests = 0; // Track OpenAPI presentation requests for loading screen
    var clearAllGroupUUID = null; // Store the Clear All group UUID
    var lastAudioPlayingState = null; // Track last audio playing status to deduplicate
    var lastAudioTrackUUID = null; // Track last audio track UUID to deduplicate
    var lastAudioTrackName = ''; // Track last audio track name to deduplicate
    var lastAudioTrackArtist = ''; // Track last audio track artist to deduplicate
    var currentAnnouncementUUID = null; // Track UUID of presentation on announcement layer
    var currentPresentationUUID = null; // Track UUID of presentation on presentation layer
    var eventCallbacks = {
        onOpen: null,
        onClose: null,
        onMessage: null,
        onError: null
    };

    /**
     * Initialize the API connection
     */
    function connect() {
        if (isOpenAPI) {
            connectOpenAPI();
        } else {
            connectClassic();
        }
    }

    /**
     * Connect using Classic WebSocket API
     */
    function connectClassic() {
        var wsProtocol = (window.location.protocol === "https:") ? "wss://" : "ws://";
        wsUri = wsProtocol + host + ":" + port;
        wsConnection = new WebSocket(wsUri + "/remote");
        
        wsConnection.onopen = function() {
            if (eventCallbacks.onOpen) eventCallbacks.onOpen();
        };
        
        wsConnection.onclose = function() {
            if (eventCallbacks.onClose) eventCallbacks.onClose();
        };
        
        wsConnection.onmessage = function(evt) {
            if (eventCallbacks.onMessage) eventCallbacks.onMessage(evt);
        };
        
        wsConnection.onerror = function(evt) {
            if (eventCallbacks.onError) eventCallbacks.onError(evt);
        };
    }

    /**
     * Connect using OpenAPI
     */
    function connectOpenAPI() {
        // Check if running under ingress (no config.js port, or same origin)
        // When under ingress, use relative path. Otherwise use configured host:port
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            // Running under ingress with a path prefix
            baseURL = window.location.protocol + '//' + window.location.host + window.location.pathname.replace(/\/$/, '');
        } else if (typeof host === 'undefined' || typeof port === 'undefined') {
            // No host/port configured, assume same origin
            baseURL = window.location.protocol + '//' + window.location.host;
        } else {
            // Direct connection with configured host:port
            baseURL = 'http://' + host + ':' + port;
        }
        
        // Test connection
        fetch(baseURL + '/version', { method: 'GET' })
            .then(response => {
                if (response.ok) {
                    // Successfully connected
                    // Fetch clear groups to get Clear All UUID
                    fetchClearGroups();
                    
                    // Trigger onOpen
                    if (eventCallbacks.onOpen) {
                        // For OpenAPI, we skip authentication
                        setTimeout(function() {
                            simulateMessage({ action: "authenticate", authenticated: "1" });
                        }, 100);
                    }
                    // Start status stream listener for real-time updates
                    startStatusStream();
                    // Polling disabled - streaming is now working correctly
                } else {
                    throw new Error('Connection failed');
                }
            })
            .catch(error => {
                console.error('OpenAPI connection error:', error);
                if (eventCallbacks.onError) {
                    eventCallbacks.onError({ message: error.message });
                }
                // Retry connection
                setTimeout(connect, 1000);
            });
    }

    /**
     * Start real-time status stream from ProPresenter API
     * Uses POST request with JSON body containing endpoints to monitor
     */
    function startStatusStream() {
        var statusStreamUrl = baseURL + '/v1/status/updates';
        
        // List of status endpoints to monitor for real-time updates
        var endpointsToMonitor = [
            'presentation/slide_index',
            'announcement/slide_index',
            'presentation/active',
            'presentation/focused',
            'announcement/active',  // Monitor active announcement (note: no announcement/focused endpoint)
            'status/layers',  // Monitor layer status for clear button states
            'transport/audio/current',  // Monitor current audio track and playing state
            'timer/system_time'  // Include timer to verify stream is active
        ];
        
        fetch(statusStreamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(endpointsToMonitor)
        })
            .then(response => {
                if (!response.ok) {
                    console.error('OpenAPI: Stream response not ok:', response.status);
                    throw new Error('Failed to open status stream');
                }
                
                var reader = response.body.getReader();
                var decoder = new TextDecoder();
                var buffer = '';
                var updateCount = 0;
                
                function read() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            // Reconnect after a delay
                            setTimeout(startStatusStream, 2000);
                            return;
                        }
                        
                        if (value) {
                            buffer += decoder.decode(value, { stream: true });
                            var lines = buffer.split('\n');
                            
                            // Keep the last incomplete line in the buffer
                            buffer = lines.pop() || '';
                            
                            lines.forEach(function(line) {
                                if (line.trim()) {
                                    try {
                                        updateCount++;
                                        var statusUpdate = JSON.parse(line);
                                        // Verbose logging commented out for production
                                        // if (statusUpdate.url !== 'timer/system_time') {
                                        //     console.log('OpenAPI: Stream raw update:', statusUpdate.url, JSON.stringify(statusUpdate).substring(0, 150));
                                        // }
                                        handleStatusUpdate(statusUpdate);
                                    } catch (e) {
                                        console.error('OpenAPI: Parse error on line:', line.substring(0, 100), 'Error:', e.message);
                                    }
                                }
                            });
                        }
                        
                        read();
                    }).catch(error => {
                        console.error('OpenAPI: Status stream read error:', error);
                        // Reconnect after a delay
                        setTimeout(startStatusStream, 2000);
                    });
                }
                
                read();
            })
            .catch(error => {
                console.error('OpenAPI: Failed to open status stream:', error);
                // Retry after a delay
                setTimeout(startStatusStream, 2000);
            });
    }

    /**
     * Handle incoming status updates from the stream
     * Format: {"url": "presentation/slide_index", "data": {...}}
     */
    function handleStatusUpdate(statusUpdate) {
        if (!statusUpdate || !statusUpdate.url || statusUpdate.data === undefined) {
            return;
        }
        
        var url = statusUpdate.url;
        var data = statusUpdate.data;
        
        // Handle slide index updates
        if (url === 'presentation/slide_index') {
            // Data structure: {"presentation_index": {"index": 7, "presentation_id": {"uuid": "...", ...}}}
            if (data.presentation_index && data.presentation_index.index !== undefined && 
                data.presentation_index.presentation_id && data.presentation_index.presentation_id.uuid) {
                var slideIndex = data.presentation_index.index;
                var presentationUUID = data.presentation_index.presentation_id.uuid;
                
                // console.log('OpenAPI: Stream - Slide index:', slideIndex, 'Presentation:', presentationUUID.substring(0, 8) + '...');
                simulateMessage({
                    action: 'presentationSlideIndex',
                    slideIndex: parseInt(slideIndex),
                    presentationPath: presentationUUID
                });
            }
        }
        // Handle announcement slide index
        else if (url === 'announcement/slide_index') {
            // Data structure: {"announcement_index": {"index": X, "presentation_id": {...}} or null}
            if (data.announcement_index && data.announcement_index.index !== undefined && 
                data.announcement_index.presentation_id && data.announcement_index.presentation_id.uuid) {
                var slideIndex = data.announcement_index.index;
                var presentationUUID = data.announcement_index.presentation_id.uuid;
                
                // console.log('OpenAPI: Stream - Announcement index:', slideIndex, 'Presentation:', presentationUUID.substring(0, 8) + '...');
                simulateMessage({
                    action: 'presentationSlideIndex',
                    slideIndex: parseInt(slideIndex),
                    presentationPath: presentationUUID
                });
            }
        }
        // Handle active presentation change
        else if (url === 'presentation/active') {
            // Data structure: {"presentation": {"id": {"uuid": "...", ...}, "groups": [...]}}
            if (data.presentation && data.presentation.id && data.presentation.id.uuid) {
                var presId = data.presentation.id.uuid;
                // console.log('OpenAPI: Stream - Active presentation changed to:', presId.substring(0, 8) + '...');
                // Fetch full presentation data
                executeOpenAPIRequest(
                    { method: 'GET', path: '/v1/presentation/' + presId, handler: handlePresentationRequest },
                    { action: 'presentationRequest', presentationPath: presId, presentationSlideQuality: '300' }
                );
            }
        }
        // Handle presentation focused (when presenter clicks on a presentation)
        else if (url === 'presentation/focused') {
            // Data structure: {"uuid": "...", "name": "...", "index": 0}
            if (data.uuid) {
                var presId = data.uuid;
                // console.log('OpenAPI: Stream - Presentation focused:', presId.substring(0, 8) + '...');
                // Fetch full presentation data
                executeOpenAPIRequest(
                    { method: 'GET', path: '/v1/presentation/' + presId, handler: handlePresentationRequest },
                    { action: 'presentationRequest', presentationPath: presId, presentationSlideQuality: '300' }
                );
            }
        }
        // Handle active announcement change
        else if (url === 'announcement/active') {
            // Data structure: {"announcement": {"id": {"uuid": "...", ...}, "groups": [...]}}
            // The stream already includes full presentation data, so we can process it directly!
            if (data.announcement && data.announcement.id && data.announcement.id.uuid) {
                var presId = data.announcement.id.uuid;
                // console.log('OpenAPI: Stream - Active announcement changed to:', presId.substring(0, 8) + '...');
                // Track which UUID is on the announcement layer
                currentAnnouncementUUID = presId;
                // Process announcement data directly from stream (no need to fetch)
                handleAnnouncementData(data.announcement, { 
                    action: 'presentationRequest', 
                    presentationPath: presId, 
                    presentationSlideQuality: '300' 
                });
            }
        }
        // Handle layer status changes (for clear button states)
        else if (url === 'status/layers') {
            // Update clear button states based on layer status
            updateClearButtonStates(data);
        }
        // Handle audio transport changes (current audio and playing state)
        else if (url === 'transport/audio/current') {
            handleAudioCurrent(data);
            handleAudioPlaying(data);
        }
        // Silently ignore timer updates (too verbose)
        else if (url !== 'timer/system_time') {
            // Silently ignore other unhandled updates
        }
    }

    /**
     * Update clear button states based on layer status
     */
    function updateClearButtonStates(layerStatus) {
        // layerStatus format: {"slide": true/false, "audio": true/false, ...}
        
        // Track if any layer is active for clear all
        var anyActive = false;
        
        // Check slide layer (presentation/presentation_media)
        if (layerStatus.slide || layerStatus.presentation || layerStatus.presentation_media) {
            $("#clear-slide").addClass("activated");
            anyActive = true;
        } else {
            $("#clear-slide").removeClass("activated");
        }
        
        // Check audio layer
        if (layerStatus.audio || layerStatus.music || layerStatus.audio_effects) {
            $("#clear-audio").addClass("activated");
            anyActive = true;
        } else {
            $("#clear-audio").removeClass("activated");
        }
        
        // Check messages layer
        if (layerStatus.messages) {
            $("#clear-text").addClass("activated");
            anyActive = true;
        } else {
            $("#clear-text").removeClass("activated");
        }
        
        // Check announcements layer
        if (layerStatus.announcements) {
            $("#clear-announcements").addClass("activated");
            anyActive = true;
        } else {
            $("#clear-announcements").removeClass("activated");
        }
        
        // Check props layer
        if (layerStatus.props) {
            $("#clear-props").addClass("activated");
            anyActive = true;
        } else {
            $("#clear-props").removeClass("activated");
        }
        
        // Check media/video layer
        if (layerStatus.media || layerStatus.video_input) {
            $("#clear-media").addClass("activated");
            anyActive = true;
        } else {
            $("#clear-media").removeClass("activated");
        }
        
        // Update clear all button
        if (anyActive) {
            $("#clear-all").addClass("activated");
        } else {
            $("#clear-all").removeClass("activated");
        }
    }

    /**
     * Start polling for updates in OpenAPI mode
     */
    function startPolling() {
        // Poll for presentation changes every 1 second (fallback if streaming fails)
        openAPIPollingInterval = setInterval(function() {
            pollPresentationStatus();
        }, 1000);
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (openAPIPollingInterval) {
            clearInterval(openAPIPollingInterval);
            openAPIPollingInterval = null;
        }
    }

    /**
     * Poll for presentation status changes
     */
    function pollPresentationStatus() {
        fetch(baseURL + '/v1/presentation/slide_index', { method: 'GET' })
            .then(response => response.json())
            .then(data => {
                if (data.presentation_index !== undefined) {
                    var currentIndex = data.presentation_index.index;
                    var currentUUID = data.presentation_index.presentation_id ? 
                        data.presentation_index.presentation_id.uuid : null;
                    
                    // Check if presentation or slide changed
                    if (currentUUID !== lastPresentationUUID || currentIndex !== lastSlideIndex) {
                        lastSlideIndex = currentIndex;
                        lastPresentationUUID = currentUUID;
                        
                        // Only trigger if we have a valid UUID (presentation is active)
                        if (currentUUID) {
                            // Trigger slide index update
                            simulateMessage({ 
                                action: "presentationSlideIndex", 
                                slideIndex: currentIndex.toString(),
                                presentationPath: currentUUID  // Add presentation path
                            });
                        }
                    }
                }
            })
            .catch(err => {
                // Silently ignore errors during polling
                // console.error('Poll error:', err);
            });
    }

    /**
     * Fetch clear groups to get the Clear All UUID
     */
    function fetchClearGroups() {
        fetch(baseURL + '/v1/clear/groups')
            .then(response => response.json())
            .then(groups => {
                // Find the "Clear All" group
                if (groups && Array.isArray(groups)) {
                    for (var i = 0; i < groups.length; i++) {
                        var groupName = groups[i].id && groups[i].id.name ? groups[i].id.name : '';
                        if (groupName.toLowerCase() === 'clear all') {
                            clearAllGroupUUID = groups[i].id.uuid;
                            break;
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching clear groups:', error);
            });
    }

    /**
     * Simulate a WebSocket message for OpenAPI responses
     */
    function simulateMessage(dataObj) {
        if (eventCallbacks.onMessage) {
            var evt = {
                data: JSON.stringify(dataObj)
            };
            eventCallbacks.onMessage(evt);
        }
    }

    /**
     * Send a command (unified interface)
     */
    function send(jsonString) {
        if (isOpenAPI) {
            sendOpenAPI(jsonString);
        } else {
            sendClassic(jsonString);
        }
    }

    /**
     * Send command via Classic WebSocket
     */
    function sendClassic(jsonString) {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(jsonString);
        }
    }

    /**
     * Send command via OpenAPI HTTP
     */
    function sendOpenAPI(jsonString) {
        try {
            var cmd = JSON.parse(jsonString);
            var endpoint = mapClassicToOpenAPI(cmd);
            
            if (endpoint) {
                executeOpenAPIRequest(endpoint, cmd);
            } else {
                console.warn('No OpenAPI mapping for command:', cmd);
            }
        } catch (e) {
            console.error('Error parsing command:', e);
        }
    }

    /**
     * Map Classic API commands to OpenAPI endpoints
     */
    function mapClassicToOpenAPI(cmd) {
        var action = cmd.action;
        var mapping = {
            // Authentication (no-op for OpenAPI)
            'authenticate': null,
            
            // Library
            'libraryRequest': { method: 'GET', path: '/v1/libraries', handler: handleLibraryRequest },
            
            // Playlists
            'playlistRequestAll': { method: 'GET', path: '/v1/playlists', handler: handlePlaylistRequest },
            
            // Audio
            'audioRequest': { method: 'GET', path: '/v1/audio/playlists', handler: handleAudioRequest },
            'audioCurrentSong': { method: 'GET', path: '/v1/transport/audio/current', handler: handleAudioCurrent },
            'audioIsPlaying': { method: 'GET', path: '/v1/transport/audio/current', handler: handleAudioPlaying },
            'audioPlayPause': { method: 'GET', path: '/v1/transport/audio/current', handler: handleAudioPlayPause }, // Handle dynamically
            'audioStartCue': { method: 'GET', path: '/v1/audio/playlist/' + extractAudioPath(cmd), handler: null },
            
            // Presentation
            'presentationRequest': { method: 'GET', path: buildPresentationRequestPath(cmd), handler: handlePresentationRequest },
            'presentationCurrent': { method: 'GET', path: '/v1/presentation/active', handler: handlePresentationCurrent },
            'presentationSlideIndex': { method: 'GET', path: '/v1/presentation/slide_index', handler: handleSlideIndex },
            'presentationTriggerIndex': { method: 'GET', path: buildPresentationTriggerPath(cmd), handler: handlePresentationTrigger },
            'presentationTriggerNext': { method: 'GET', path: '/v1/presentation/active/next/trigger', handler: null },
            'presentationTriggerPrevious': { method: 'GET', path: '/v1/presentation/active/previous/trigger', handler: null },
            
            // Timeline
            'timelinePlayPause': { method: 'GET', path: '/v1/presentation/active/timeline/play', handler: null },
            
            // Clear operations
            'clearAll': { method: 'GET', path: clearAllGroupUUID ? '/v1/clear/group/' + clearAllGroupUUID + '/trigger' : null, handler: null },
            'clearAudio': { method: 'GET', path: '/v1/clear/layer/audio', handler: null },
            'clearMessages': { method: 'GET', path: '/v1/clear/layer/messages', handler: null },
            'clearProps': { method: 'GET', path: '/v1/clear/layer/props', handler: null },
            'clearAnnouncements': { method: 'GET', path: '/v1/clear/layer/announcements', handler: null },
            'clearText': { method: 'GET', path: '/v1/clear/layer/messages', handler: null },
            'clearVideo': { method: 'GET', path: '/v1/clear/layer/media', handler: null },
            'clearSlide': { method: 'GET', path: '/v1/clear/layer/slide', handler: null },
            
            // Clocks/Timers
            'clockRequest': { method: 'GET', path: '/v1/timers', handler: handleClockRequest },
            'clockStart': { method: 'GET', path: '/v1/timer/' + cmd.clockIndex + '/start', handler: null },
            'clockStop': { method: 'GET', path: '/v1/timer/' + cmd.clockIndex + '/stop', handler: null },
            'clockReset': { method: 'GET', path: '/v1/timer/' + cmd.clockIndex + '/reset', handler: null },
            'clockStopAll': { method: 'GET', path: '/v1/timers/stop', handler: null },
            'clockResetAll': { method: 'GET', path: '/v1/timers/reset', handler: null },
            'clockStartAll': { method: 'GET', path: '/v1/timers/start', handler: null },
            'clockStartSendingCurrentTime': { method: 'GET', path: '/v1/timers/current', handler: handleClockCurrentTime },
            'clockStopSendingCurrentTime': null, // Stop polling
            'clockUpdate': { method: 'PUT', path: '/v1/timer/' + cmd.clockIndex, handler: null, body: buildClockUpdate(cmd) },
            
            // Messages
            'messageRequest': { method: 'GET', path: '/v1/messages', handler: handleMessageRequest },
            'messageSend': { method: 'POST', path: '/v1/message/' + cmd.messageIndex + '/trigger', handler: null, body: buildMessageBody(cmd) },
            'messageHide': { method: 'GET', path: '/v1/message/' + cmd.messageIndex + '/clear', handler: null },
            
            // Stage Display
            'stageDisplaySets': { method: 'GET', path: '/v1/stage/screens', handler: handleStageDisplaySets },
            'stageDisplaySendMessage': { method: 'PUT', path: '/v1/stage/message', handler: null, body: { message: cmd.stageDisplayMessage } },
            'stageDisplayHideMessage': { method: 'DELETE', path: '/v1/stage/message', handler: null },
            'stageDisplayChangeLayout': { method: 'GET', path: '/v1/stage/screen/' + cmd.stageScreenUUID + '/layout/' + cmd.stageLayoutUUID, handler: null }
        };
        
        return mapping[action];
    }

    /**
     * Execute OpenAPI request
     */
    function executeOpenAPIRequest(endpoint, originalCmd) {
        if (!endpoint) return;
        
        // Handle null path (e.g., clearAll before clear groups fetched)
        if (!endpoint.path) {
            console.warn('OpenAPI endpoint path is null for command:', originalCmd.action);
            return;
        }
        
        var url = baseURL + endpoint.path;
        
        // Track presentation requests for loading screen
        if (originalCmd.action === 'presentationRequest') {
            pendingPresentationRequests++;
            window.presentationRequestsPending = pendingPresentationRequests;
        }
        
        var options = {
            method: endpoint.method || 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (endpoint.body) {
            options.body = JSON.stringify(endpoint.body);
        }
        
        fetch(url, options)
            .then(response => {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json().catch(() => null); // Some endpoints return empty response
            })
            .then(data => {
                // Decrement counter for completed presentation requests
                if (originalCmd.action === 'presentationRequest') {
                    pendingPresentationRequests--;
                    window.presentationRequestsPending = pendingPresentationRequests;
                }
                
                if (endpoint.handler) {
                    endpoint.handler(data, originalCmd);
                }
            })
            .catch(error => {
                // Decrement counter for failed presentation requests
                if (originalCmd.action === 'presentationRequest') {
                    pendingPresentationRequests--;
                    window.presentationRequestsPending = pendingPresentationRequests;
                }
                
                console.warn('OpenAPI request failed (may be deleted presentation):', error, 'URL:', url);
                // For presentation requests that fail, send an empty presentation to allow site.js to continue
                if (originalCmd.action === 'presentationRequest' && endpoint.handler) {
                    // Send minimal presentation data to trigger cleanup in site.js
                    // Use presentationSlideGroups (not groups) to match expected structure
                    endpoint.handler({
                        presentation: {
                            id: { uuid: originalCmd.presentationPath, name: 'Error', index: 0 },
                            presentationSlideGroups: [],
                            has_timeline: false,
                            presentation_path: 'Error loading presentation',
                            destination: 'presentation'
                        }
                    }, originalCmd);
                }
            });
    }

    // Helper functions for building paths and bodies

    function extractAudioPath(cmd) {
        // Extract playlist ID and item ID from audio path
        // Format: "playlistUUID:itemUUID"
        var path = cmd.audioChildPath || '';
        if (path.indexOf(':') > -1) {
            var parts = path.split(':');
            // Return path in format: playlistUUID/itemUUID/trigger
            return parts[0] + '/' + parts[1] + '/trigger';
        }
        return '';
    }

    function buildPresentationTriggerPath(cmd) {
        // For playlist items with duplicates, presentationUUID contains the actual presentation UUID
        // and presentationPath contains the unique item UUID. Use presentationUUID if available.
        var presentationId = cmd.presentationUUID || cmd.presentationPath || 'active';
        
        // Check if this is an OpenAPI library path format: "OpenAPI/Libraries/LibraryName/PresentationName/uuid"
        if (presentationId.indexOf('OpenAPI/Libraries/') === 0) {
            // Extract UUID from path (last component)
            var pathParts = presentationId.split('/');
            presentationId = pathParts[pathParts.length - 1]; // Last part is the UUID
        }
        
        // Determine if this is an announcement (presentationDestination == 1)
        var isAnnouncement = (cmd.presentationDestination == 1);
        
        // console.log('buildPresentationTriggerPath() - presentationId:', presentationId, 'slideIndex:', cmd.slideIndex, 'presentationDestination:', cmd.presentationDestination, 'isAnnouncement:', isAnnouncement);
        
        if (isAnnouncement) {
            // Announcements can only be triggered via 'active', not by UUID
            // So we must use 'active' regardless of presentationId
            if (cmd.slideIndex !== undefined) {
                var path = '/v1/announcement/active/' + cmd.slideIndex + '/trigger';
                // console.log('  -> Built announcement path:', path);
                return path;
            }
            return '/v1/announcement/active/trigger';
        } else {
            // Regular presentations can be triggered by UUID or 'active'
            if (cmd.slideIndex !== undefined) {
                return '/v1/presentation/' + presentationId + '/' + cmd.slideIndex + '/trigger';
            }
            return '/v1/presentation/' + presentationId + '/trigger';
        }
    }

    function buildPresentationRequestPath(cmd) {
        // If a presentation path is provided, use it to get specific presentation
        if (cmd.presentationPath) {
            // If presentationUUID is provided, use that for the API call (handles duplicate presentations in playlists)
            // presentationPath contains the unique item UUID, presentationUUID contains the actual presentation UUID
            var uuidToUse = cmd.presentationUUID || cmd.presentationPath;
            
            // Check if this is an OpenAPI library path format: "OpenAPI/Libraries/PresentationName/uuid"
            if (uuidToUse.indexOf('OpenAPI/Libraries/') === 0) {
                // Extract UUID from path (last component)
                var pathParts = uuidToUse.split('/');
                var uuid = pathParts[pathParts.length - 1]; // Last part is the UUID
                return '/v1/presentation/' + uuid;
            }
            
            // Use the UUID directly for the API call
            return '/v1/presentation/' + uuidToUse;
        }
        // Otherwise get active presentation
        return '/v1/presentation/active';
    }

    function buildClockUpdate(cmd) {
        var body = {
            name: cmd.clockName
        };
        
        if (cmd.clockType === '0') {
            // Countdown
            body.type = 'countdown';
            body.duration = cmd.clockTime;
            body.allows_overrun = cmd.clockOverrun === '1';
        } else if (cmd.clockType === '1') {
            // Countdown to time
            body.type = 'countdown_to_time';
            body.time_of_day = cmd.clockElapsedTime;
        } else if (cmd.clockType === '2') {
            // Elapsed time
            body.type = 'elapsed';
        }
        
        return body;
    }

    function buildMessageBody(cmd) {
        var body = {};
        if (cmd.messageKeys && cmd.messageValues) {
            for (var i = 0; i < cmd.messageKeys.length; i++) {
                body[cmd.messageKeys[i]] = cmd.messageValues[i];
            }
        }
        return body;
    }

    // Response handlers - convert OpenAPI responses to Classic format

    function handleLibraryRequest(data) {
        // Convert OpenAPI library response to classic format
        // In OpenAPI: GET /v1/libraries returns array of libraries
        // Then GET /v1/library/{uuid} returns presentations in that library
        
        console.log('OpenAPI: Library request - fetching libraries');
        
        // Fetch all libraries
        fetch(baseURL + '/v1/libraries', { method: 'GET' })
            .then(response => {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(librariesData => {
                console.log('OpenAPI: Received', librariesData ? librariesData.length : 0, 'libraries');
                
                var libraryPaths = [];
                var libraryFetches = [];
                
                if (librariesData && Array.isArray(librariesData)) {
                    librariesData.forEach(function(library) {
                        // OpenAPI library structure: {uuid, name, index}
                        var libraryId = library.uuid || '';
                        var libraryName = library.name || '';
                        
                        console.log('OpenAPI: Library:', libraryName, 'ID:', libraryId);
                        
                        if (libraryId) {
                            // Fetch presentations in this library
                            var promise = fetch(baseURL + '/v1/library/' + libraryId, { method: 'GET' })
                                .then(response => {
                                    if (!response.ok) {
                                        throw new Error('HTTP ' + response.status);
                                    }
                                    return response.json();
                                })
                                .then(libraryData => {
                                    // Response: {update_type, items: [{uuid, name, index}]}
                                    var items = libraryData.items || [];
                                    console.log('OpenAPI: Library', libraryName, 'has', items.length, 'presentations');
                                    
                                    items.forEach(function(item) {
                                        // Build fake path matching Classic API format
                                        // Classic: "C:/Users/.../Libraries/LibraryName/PresentationName.pro"
                                        // Our format: "OpenAPI/Libraries/{LibraryName}/{PresentationName}/{uuid}"
                                        var presName = item.name || 'Presentation';
                                        var presId = item.uuid || '';
                                        var fakePath = 'OpenAPI/Libraries/' + libraryName + '/' + presName + '/' + presId;
                                        libraryPaths.push(fakePath);
                                    });
                                })
                                .catch(err => {
                                    console.error('OpenAPI: Failed to fetch library', libraryName, err);
                                });
                            
                            libraryFetches.push(promise);
                        }
                    });
                }
                
                return Promise.all(libraryFetches).then(() => libraryPaths);
            })
            .then(libraryPaths => {
                console.log('OpenAPI: Sending', libraryPaths.length, 'library presentations to site.js');
                
                simulateMessage({
                    action: 'libraryRequest',
                    library: libraryPaths
                });
            })
            .catch(err => {
                console.error('OpenAPI: Error gathering library presentations:', err);
                
                // Fallback: send empty library
                console.log('OpenAPI: Sending empty library');
                simulateMessage({
                    action: 'libraryRequest',
                    library: []
                });
            });
    }

    function handlePlaylistRequest(data) {
        // Convert OpenAPI playlist response to classic format
        // We need to fetch items for each playlist
        var playlists = [];
        var fetchPromises = [];
        
        // console.log('OpenAPI: Received', data.length, 'playlists');
        
        if (data && Array.isArray(data)) {
            data.forEach(function(playlist) {
                // OpenAPI structure: id.uuid, id.name, id.index
                var playlistId = playlist.id ? playlist.id.uuid : (playlist.uuid || '');
                var playlistName = playlist.id ? playlist.id.name : (playlist.name || '');
                var playlistType = playlist.field_type || playlist.type || 'playlist'; // field_type is correct field
                
                // console.log('OpenAPI: Playlist:', playlistName, 'Type:', playlistType, 'ID:', playlistId);
                
                // If this is a folder/group with children, create a group entry with nested children
                if (playlistType === 'group') {
                    // console.log('OpenAPI: Processing folder with', (playlist.children ? playlist.children.length : 0), 'children');
                    
                    // We need to fetch all children first, then create the folder with children nested
                    var childPromises = [];
                    
                    if (playlist.children && Array.isArray(playlist.children)) {
                        playlist.children.forEach(function(childPlaylist) {
                            var childId = childPlaylist.id ? childPlaylist.id.uuid : '';
                            var childName = childPlaylist.id ? childPlaylist.id.name : '';
                            var childType = childPlaylist.field_type || childPlaylist.type || 'playlist';
                            
                            if (childId && childType === 'playlist') {
                                // console.log('OpenAPI: Fetching items for nested playlist:', childName, childId);
                                // Fetch the nested playlist
                                var childPromise = fetch(baseURL + '/v1/playlist/' + childId, { method: 'GET' })
                                    .then(response => {
                                        if (!response.ok) {
                                            throw new Error('HTTP ' + response.status);
                                        }
                                        return response.json();
                                    })
                                    .then(playlistData => {
                                        var items = playlistData.items || [];
                                        // console.log('OpenAPI: Nested playlist', childName, 'has', items.length, 'items');
                                        var playlistItems = [];
                                        if (items && Array.isArray(items)) {
                            items.forEach(function(item) {
                                var itemType = item.type || 'presentation';
                                var mappedType = 'playlistItemTypePresentation';
                                if (itemType === 'header') mappedType = 'playlistItemTypeHeader';
                                else if (itemType === 'placeholder') mappedType = 'playlistItemTypePlaceholder';
                                else if (itemType === 'video') mappedType = 'playlistItemTypeVideo';
                                else if (itemType === 'audio') mappedType = 'playlistItemTypeAudio';                                                // For playlist items, use the item UUID as unique identifier
                                                // Store presentation UUID separately for API calls
                                                var itemUuid = item.id ? item.id.uuid : '';
                                                var presentationUuid = '';
                                                if (item.presentation_info && item.presentation_info.presentation_uuid) {
                                                    presentationUuid = item.presentation_info.presentation_uuid;
                                                }
                                                
                                                var itemName = item.id ? item.id.name : (item.name || '');
                                                // console.log('    - Item:', itemName, 'Type:', mappedType, 'Item UUID:', itemUuid, 'Pres UUID:', presentationUuid);
                                                
                                                playlistItems.push({
                                                    playlistItemType: mappedType,
                                                    playlistItemLocation: itemUuid,  // Use item UUID as unique location
                                                    playlistItemName: itemName,
                                                    playlistItemThumbnail: '',
                                                    presentationUUID: presentationUuid  // Store presentation UUID for API calls
                                                });
                                            });
                                        }
                                        
                                        return {
                                            playlistLocation: childId,
                                            playlistName: childName,
                                            playlistType: 'playlistTypePlaylist',
                                            playlist: playlistItems
                                        };
                                    })
                                    .catch(err => {
                                        console.error('Failed to fetch nested playlist items:', err);
                                        return null;
                                    });
                                
                                childPromises.push(childPromise);
                            }
                        });
                    }
                    
                    // After all children are fetched, create the folder with nested playlists
                    var folderPromise = Promise.all(childPromises).then(children => {
                        return {
                            playlistLocation: playlistId,
                            playlistName: playlistName,
                            playlistType: 'playlistTypeGroup',
                            playlist: children.filter(c => c !== null) // Nested children go here!
                        };
                    });
                    
                    fetchPromises.push(folderPromise);
                    return; // Done processing folder
                }
                
                // Process only actual playlists (not folders/groups)
                if (playlistId && playlistType === 'playlist') {
                    // console.log('OpenAPI: Fetching items for playlist:', playlistName, playlistId);
                    
                    // Fetch playlist contents
                    var promise = fetch(baseURL + '/v1/playlist/' + playlistId, { method: 'GET' })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error('HTTP ' + response.status);
                            }
                            return response.json();
                        })
                        .then(playlistData => {
                            // OpenAPI returns {id: {}, items: []}
                            var items = playlistData.items || [];
                            // console.log('OpenAPI: Playlist', playlistName, 'has', items.length, 'items');
                            var playlistItems = [];
                            if (items && Array.isArray(items)) {
                items.forEach(function(item) {
                    // Map item types
                    var itemType = item.type || 'presentation';
                    var mappedType = 'playlistItemTypePresentation';
                    if (itemType === 'header') mappedType = 'playlistItemTypeHeader';
                    else if (itemType === 'placeholder') mappedType = 'playlistItemTypePlaceholder';
                    else if (itemType === 'video') mappedType = 'playlistItemTypeVideo';
                    else if (itemType === 'audio') mappedType = 'playlistItemTypeAudio';                                    // For playlist items, use the item UUID as unique identifier
                                    // Store presentation UUID separately for API calls
                                    var itemUuid = item.id ? item.id.uuid : '';
                                    var presentationUuid = '';
                                    if (item.presentation_info && item.presentation_info.presentation_uuid) {
                                        presentationUuid = item.presentation_info.presentation_uuid;
                                    }
                                    
                                    var itemName = item.id ? item.id.name : (item.name || '');
                                    // console.log('  - Item:', itemName, 'Type:', mappedType, 'Item UUID:', itemUuid, 'Pres UUID:', presentationUuid);
                                    
                                    playlistItems.push({
                                        playlistItemType: mappedType,
                                        playlistItemLocation: itemUuid,  // Use item UUID as unique location
                                        playlistItemName: itemName,
                                        playlistItemThumbnail: '',
                                        presentationUUID: presentationUuid  // Store presentation UUID for API calls
                                    });
                                });
                            }
                            
                            return {
                                playlistLocation: playlistId,
                                playlistName: playlistName,
                                playlistType: playlistType === 'group' ? 'playlistTypeGroup' : 'playlistTypePlaylist',
                                playlist: playlistItems
                            };
                        })
                        .catch(err => {
                            console.error('Failed to fetch playlist items:', err);
                            return {
                                playlistLocation: playlistId,
                                playlistName: playlistName,
                                playlistType: playlistType === 'group' ? 'playlistTypeGroup' : 'playlistTypePlaylist',
                                playlist: []
                            };
                        });
                    
                    fetchPromises.push(promise);
                } else {
                    // No ID, skip this playlist
                    console.warn('OpenAPI: Playlist has no ID, skipping');
                }
            });
        }
        
        // Wait for all playlist items to be fetched
        Promise.all(fetchPromises)
            .then(fetchedPlaylists => {
                // Filter out any nulls from failed fetches
                var allPlaylists = fetchedPlaylists.filter(p => p !== null);
                console.log('OpenAPI: Sending', allPlaylists.length, 'playlists to site.js');
                
                simulateMessage({
                    action: 'playlistRequestAll',
                    playlistAll: allPlaylists
                });
            })
            .catch(err => {
                console.error('Error fetching playlists:', err);
                // Send empty array on error
                simulateMessage({
                    action: 'playlistRequestAll',
                    playlistAll: []
                });
            });
    }

    function handleAudioRequest(data) {
        // Convert OpenAPI audio playlist response
        // Need to fetch each playlist's details to get items
        
        if (!data || !Array.isArray(data)) {
            simulateMessage({
                action: 'audioRequest',
                audioPlaylist: []
            });
            return;
        }
        
        var audioPlaylists = [];
        var fetchPromises = [];
        
        data.forEach(function(playlist) {
            var playlistUuid = playlist.id ? playlist.id.uuid : null;
            var playlistName = playlist.id ? playlist.id.name : '';
            var playlistIndex = playlist.id ? playlist.id.index : 0;
            
            if (!playlistUuid) {
                return;
            }
            
            // Fetch each playlist's details to get its items
            var promise = fetch(baseURL + '/v1/audio/playlist/' + playlistUuid)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function(playlistDetails) {
                    // Convert items to expected format
                    var items = [];
                    if (playlistDetails.items && Array.isArray(playlistDetails.items)) {
                        playlistDetails.items.forEach(function(item) {
                            items.push({
                                playlistItemLocation: playlistUuid + ':' + (item.id ? item.id.uuid : ''),  // Store as "playlistUUID:itemUUID"
                                playlistItemName: item.id ? item.id.name : '',
                                playlistItemType: item.type || 'audio'
                            });
                        });
                    }
                    
                    audioPlaylists.push({
                        playlistLocation: playlistUuid,
                        playlistName: playlistName,
                        playlistType: 'playlistTypePlaylist',
                        playlist: items,  // This is what displayAudioPlaylist expects
                        playlistIndex: playlistIndex  // Store index for sorting
                    });
                })
                .catch(function(error) {
                    console.error('Error fetching audio playlist ' + playlistName + ':', error);
                });
            
            fetchPromises.push(promise);
        });
        
        // Wait for all playlists to be fetched
        Promise.all(fetchPromises).then(function() {
            // Sort by index to maintain ProPresenter order
            audioPlaylists.sort(function(a, b) {
                return a.playlistIndex - b.playlistIndex;
            });
            
            simulateMessage({
                action: 'audioRequest',
                audioPlaylist: audioPlaylists
            });
        });
    }

    function handleAudioCurrent(data) {
        // Handle current audio song
        // Data format: {uuid, name, artist, is_playing, duration, audio_only}
        if (data && data.name) {
            // Only send message if track changed
            if (data.uuid !== lastAudioTrackUUID || data.name !== lastAudioTrackName || data.artist !== lastAudioTrackArtist) {
                lastAudioTrackUUID = data.uuid;
                lastAudioTrackName = data.name;
                lastAudioTrackArtist = data.artist;
                simulateMessage({
                    action: 'audioCurrentSong',
                    audioName: data.name || '',
                    audioArtist: data.artist || '',
                    audioUuid: data.uuid || ''
                });
            }
        } else {
            // No audio playing
            if (lastAudioTrackUUID !== null) {
                lastAudioTrackUUID = null;
                lastAudioTrackName = '';
                lastAudioTrackArtist = '';
                simulateMessage({
                    action: 'audioCurrentSong',
                    audioName: '',
                    audioArtist: ''
                });
            }
        }
    }

    function handleAudioPlaying(data) {
        // Handle audio playing status
        // Data format: {is_playing: true/false, ...}
        var status = null;
        if (data && data.is_playing) {
            status = 'Playing';
        } else if (data && data.name) {
            // Audio exists but not playing (paused)
            status = 'Pause';
        } else {
            // No audio loaded
            status = null;
        }
        
        // Only send message if status changed
        if (status !== lastAudioPlayingState) {
            lastAudioPlayingState = status;
            simulateMessage({
                action: 'audioIsPlaying',
                audioIsPlaying: status
            });
        }
    }

    function handleAudioPlayPause(data) {
        // Handle play/pause toggle
        // Check current state and call the appropriate endpoint
        if (data && data.is_playing) {
            // Currently playing, so pause it
            var pauseUrl = baseURL + '/v1/transport/audio/pause';
            fetch(pauseUrl, { method: 'GET' })
                .then(() => {
                    // Get updated state
                    fetch(baseURL + '/v1/transport/audio/current', { method: 'GET' })
                        .then(r => r.json())
                        .then(updated => {
                            handleAudioPlaying(updated);
                        });
                })
                .catch(e => console.error('Audio pause error:', e));
        } else {
            // Not playing or no audio, so play it
            var playUrl = baseURL + '/v1/transport/audio/play';
            fetch(playUrl, { method: 'GET' })
                .then(() => {
                    // Get updated state
                    fetch(baseURL + '/v1/transport/audio/current', { method: 'GET' })
                        .then(r => r.json())
                        .then(updated => {
                            handleAudioPlaying(updated);
                        });
                })
                .catch(e => console.error('Audio play error:', e));
        }
    }

    function handlePresentationRequest(data, originalCmd) {
        // Handle presentation request - need to build proper structure
        console.log('OpenAPI: Presentation request', originalCmd, 'Data keys:', Object.keys(data || {}));
        
        if (!data) {
            console.log('No presentation data received for:', originalCmd);
            return;
        }
        
        // OpenAPI returns {presentation: {...}} structure - extract it
        var presentation = data.presentation || data;
        var presId = presentation.id ? (presentation.id.uuid || presentation.id) : (originalCmd ? originalCmd.presentationPath : '');
        var presName = presentation.id ? (presentation.id.name || presentation.name || '') : '';
        
        // NOTE: Disabled caching with streaming active - streaming gives us real-time updates
        // When presentations are modified in ProPresenter, we need fresh data
        // Check if we have this presentation cached (disabled for now)
        // if (presentationCache[presId]) {
        //     console.log('OpenAPI: Using cached presentation', presName, presId);
        //     simulateMessage({
        //         action: 'presentationCurrent',
        //         presentationPath: originalCmd ? originalCmd.presentationPath : presId,
        //         presentation: presentationCache[presId]
        //     });
        //     return;
        // }
        
        // console.log('OpenAPI: Building presentation', presName, presId, 'has groups:', !!presentation.groups, 'group count:', presentation.groups ? presentation.groups.length : 0);
        
        // Fetch slides separately if we have a presentation ID
        if (presId) {
            var groups = [];
            
            // Check if we have groups in the response (like Classic API)
            if (presentation.groups && presentation.groups.length > 0) {
                // console.log('OpenAPI: Presentation has', presentation.groups.length, 'groups. First group structure:', presentation.groups[0]);
                // Use the groups structure from the response
                // OpenAPI uses: name, color, slides (not group_name, group_color, group_slides)
                // IMPORTANT: Use global slide index across all groups for thumbnail URL generation
                var globalSlideIndex = 0;
                groups = presentation.groups.map(function(group, groupIndex) {
                    var groupSlides = group.slides || [];
                    return {
                        groupName: group.name || '',
                        groupColor: group.color ? (group.color.hex || group.color) : '',
                        groupSlides: groupSlides.map(function(slide, localSlideIndex) {
                            var slideIndex = globalSlideIndex;
                            globalSlideIndex++;
                            return {
                                slideEnabled: slide.enabled !== false,
                                slideNotes: slide.notes || '',
                                slideText: slide.text || '',
                                slideLabel: slide.label || '',
                                slideImage: baseURL + '/v1/presentation/' + presId + '/thumbnail/' + slideIndex + '?quality=' + (originalCmd.presentationSlideQuality || '200'),
                                slideIndex: slideIndex
                            };
                        })
                    };
                });
            } else {
                // If no groups, create a single group with slides based on slide_count
                groups = [{
                    groupName: '',
                    groupColor: '',
                    groupSlides: []
                }];
                
                var slideCount = presentation.slide_count || 0;
                // console.log('OpenAPI: Creating', slideCount, 'placeholder slides');
                for (var i = 0; i < slideCount; i++) {
                    groups[0].groupSlides.push({
                        slideEnabled: true,
                        slideNotes: '',
                        slideText: '',
                        slideImage: baseURL + '/v1/presentation/' + presId + '/thumbnail/' + i + '?quality=' + (originalCmd.presentationSlideQuality || '200'),
                        slideIndex: i
                    });
                }
            }
            
            var totalSlides = groups.reduce(function(sum, g) { return sum + g.groupSlides.length; }, 0);
            // console.log('OpenAPI: Sending presentation with', groups.length, 'groups and', totalSlides, 'total slides');
            
            // Log slide index mapping for debugging
            // groups.forEach(function(group, gIdx) {
            //     var slideIndices = group.groupSlides.map(function(s) { return s.slideIndex; }).join(', ');
            //     console.log('OpenAPI:   Group ' + gIdx + ' (' + group.groupName + '): slides [' + slideIndices + ']');
            // });
            
            var presentationData = {
                presentationName: presName,
                presentationPath: presId,
                presentationSlideGroups: groups
            };
            
            // Check if this presentation UUID matches the current announcement layer
            // If so, mark it as an announcement (destination = 1)
            if (currentAnnouncementUUID && presId === currentAnnouncementUUID) {
                // console.log('OpenAPI: This presentation is on the announcement layer - setting presentationDestination: 1');
                presentationData.presentationDestination = 1;
            }
            
            // Cache the presentation
            presentationCache[presId] = presentationData;
            
            // Build the message to send to site.js
            var message = {
                action: 'presentationCurrent',
                presentationPath: originalCmd ? originalCmd.presentationPath : presId,
                presentation: presentationData
            };
            
            // If originalCmd has presentationUUID, include it (for duplicate presentations in playlists)
            // This is the actual presentation UUID, while presentationPath may be the item UUID
            if (originalCmd && originalCmd.presentationUUID) {
                message.presentationUUID = originalCmd.presentationUUID;
            }
            
            simulateMessage(message);
        }
    }

    function handleAnnouncementData(announcement, originalCmd) {
        // Process announcement data from stream (already has full groups/slides)
        // console.log('OpenAPI: Processing announcement from stream');
        
        var presId = announcement.id ? announcement.id.uuid : '';
        var presName = announcement.id ? announcement.id.name : '';
        var groups = [];
        var slideIndex = 0;
        
        // Build groups from announcement structure
        if (announcement.groups && announcement.groups.length > 0) {
            announcement.groups.forEach(function(group) {
                var slides = [];
                if (group.slides && group.slides.length > 0) {
                    group.slides.forEach(function(slide) {
                        slides.push({
                            slideEnabled: slide.enabled !== false,
                            slideNotes: slide.notes || '',
                            slideText: slide.text || '',
                            slideImage: baseURL + '/v1/presentation/' + presId + '/thumbnail/' + slideIndex + '?quality=' + (originalCmd.presentationSlideQuality || '200'),
                            slideIndex: slideIndex
                        });
                        slideIndex++;
                    });
                }
                
                groups.push({
                    groupName: group.name || '',
                    groupColor: group.color ? ('#' + Math.round(group.color.red * 255).toString(16).padStart(2, '0') + 
                                                     Math.round(group.color.green * 255).toString(16).padStart(2, '0') + 
                                                     Math.round(group.color.blue * 255).toString(16).padStart(2, '0')) : '',
                    groupSlides: slides
                });
            });
        }
        
        var presentationData = {
            presentationName: presName,
            presentationPath: presId,
            presentationSlideGroups: groups,
            presentationDestination: 1  // Always 1 for announcements
        };
        
        // console.log('OpenAPI: Sending announcement', presName, 'with', groups.length, 'groups and', slideIndex, 'total slides');
        
        simulateMessage({
            action: 'presentationCurrent',
            presentationPath: originalCmd ? originalCmd.presentationPath : presId,
            presentation: presentationData
        });
    }

    function handlePresentationCurrent(data) {
        // Convert OpenAPI presentation to classic format
        if (!data || !data.presentation) {
            return;
        }
        
        var pres = data.presentation;
        var groups = [];
        
        // Build slide groups from presentation
        if (pres.groups && Array.isArray(pres.groups)) {
            pres.groups.forEach(function(group) {
                var slideGroup = {
                    groupName: group.name || '',
                    groupColor: group.color || '',
                    groupSlides: []
                };
                
                if (group.slides && Array.isArray(group.slides)) {
                    group.slides.forEach(function(slide) {
                        slideGroup.groupSlides.push({
                            slideEnabled: slide.enabled !== false,
                            slideNotes: slide.notes || '',
                            slideText: slide.text || '',
                            slideImage: slide.thumbnail_url || '',
                            slideIndex: slide.index || 0
                        });
                    });
                }
                
                groups.push(slideGroup);
            });
        }
        
        simulateMessage({
            action: 'presentationCurrent',
            presentation: {
                presentationName: pres.name || '',
                presentationPath: pres.id ? (pres.id.uuid || pres.id) : '',
                presentationSlideGroups: groups
            }
        });
    }

    function handleSlideIndex(data) {
        if (data && data.presentation_index !== undefined) {
            simulateMessage({
                action: 'presentationSlideIndex',
                slideIndex: (data.presentation_index.index || 0).toString()
            });
        }
    }

    function handlePresentationTrigger(data, originalCmd) {
        // After triggering, simulate the trigger response
        simulateMessage({
            action: 'presentationTriggerIndex',
            slideIndex: originalCmd.slideIndex || '0',
            presentationPath: originalCmd.presentationPath || '',
            presentationDestination: originalCmd.presentationDestination || 0
        });
    }

    function handleClockRequest(data) {
        // Convert timers to clocks
        var clocks = [];
        
        if (data && Array.isArray(data)) {
            data.forEach(function(timer, index) {
                var clockObj = {
                    clockName: timer.name || 'Timer ' + index,
                    clockDuration: timer.duration || '00:00:00',
                    clockEndTime: timer.end_time || '',
                    clockTime: timer.current_time || '00:00:00',
                    clockFormat: {
                        clockTimePeriodFormat: 0  // Default to 24-hour format
                    },
                    clockIsPM: false,
                    clockOverrun: timer.allows_overrun || false,
                    clockIndex: timer.id ? (timer.id.uuid || timer.id) : index.toString(),
                    clockType: timer.type === 'countdown' ? '0' : (timer.type === 'countdown_to_time' ? '1' : '2'),
                    clockState: timer.is_running ? true : false
                };
                clocks.push(clockObj);
            });
        }
        
        simulateMessage({
            action: 'clockRequest',
            clockInfo: clocks
        });
    }

    function handleClockCurrentTime(data) {
        // Handle clock current times
        if (data && Array.isArray(data)) {
            var times = [];
            data.forEach(function(timer) {
                times.push({
                    clockTime: timer.time || '00:00:00',
                    clockIndex: timer.id ? (timer.id.uuid || timer.id) : '0'
                });
            });
            
            simulateMessage({
                action: 'clockCurrentTimes',
                clockTimes: times
            });
        }
    }

    function handleMessageRequest(data) {
        // Convert messages
        var messages = [];
        
        if (data && Array.isArray(data)) {
            data.forEach(function(msg, index) {
                var messageObj = {
                    messageIndex: msg.id ? (msg.id.uuid || msg.id) : index.toString(),
                    messageName: msg.name || '',
                    messageComponents: msg.tokens || []
                };
                messages.push(messageObj);
            });
        }
        
        simulateMessage({
            action: 'messageRequest',
            messages: messages
        });
    }

    function handleStageDisplaySets(data) {
        // Convert stage screens - need to fetch layouts separately
        var screens = [];
        
        if (data && Array.isArray(data)) {
            data.forEach(function(screen) {
                screens.push({
                    stageScreenUUID: screen.id ? (screen.id.uuid || screen.id) : '',
                    stageScreenName: screen.name || '',
                    stageLayoutSelectedLayoutUUID: screen.layout_id ? (screen.layout_id.uuid || screen.layout_id) : ''
                });
            });
        }
        
        // Fetch stage layouts to complete the data
        fetch(baseURL + '/v1/stage/layouts', { method: 'GET' })
            .then(response => response.json())
            .then(layouts => {
                var layoutList = [];
                if (layouts && Array.isArray(layouts)) {
                    layouts.forEach(function(layout) {
                        layoutList.push({
                            stageLayoutUUID: layout.id ? (layout.id.uuid || layout.id) : '',
                            stageLayoutName: layout.name || ''
                        });
                    });
                }
                
                simulateMessage({
                    action: 'stageDisplaySets',
                    stageScreens: screens,
                    stageLayouts: layoutList
                });
            })
            .catch(err => {
                // Send without layouts if fetch fails
                console.error('Failed to fetch stage layouts:', err);
                simulateMessage({
                    action: 'stageDisplaySets',
                    stageScreens: screens,
                    stageLayouts: []
                });
            });
    }

    /**
     * Close connection
     */
    function close() {
        if (isOpenAPI) {
            stopPolling();
        } else {
            if (wsConnection) {
                wsConnection.close();
            }
        }
    }

    /**
     * Set event callbacks
     */
    function setCallbacks(callbacks) {
        eventCallbacks = callbacks;
    }

    /**
     * Check if using OpenAPI
     */
    function isUsingOpenAPI() {
        return isOpenAPI;
    }

    // Public interface
    return {
        connect: connect,
        send: send,
        close: close,
        setCallbacks: setCallbacks,
        isUsingOpenAPI: isUsingOpenAPI
    };
})();

// Expose the API to the global window object for use in site.js
window.api = ProPresenterAPI;
