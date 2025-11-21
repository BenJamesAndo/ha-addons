/**
 * ProPresenter Classic WebSocket API
 * 
 * Provides WebSocket connection to ProPresenter Classic Remote Control API
 * Implements the ProPresenterAPI interface for use with site.js
 */

var ProPresenterAPI = (function() {
    'use strict';

    // Private variables
    var wsConnection = null;
    var wsUri = null;
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
        var wsProtocol = (window.location.protocol === "https:") ? "wss://" : "ws://";
        wsUri = wsProtocol + host + ":" + port;
        
        console.log('Classic API: Connecting to ' + wsUri + '/remote');
        
        wsConnection = new WebSocket(wsUri + "/remote");
        
        wsConnection.onopen = function() {
            console.log('Classic API: WebSocket connected');
            if (eventCallbacks.onOpen) {
                eventCallbacks.onOpen();
            }
        };
        
        wsConnection.onclose = function(evt) {
            console.log('Classic API: WebSocket closed, reconnecting...');
            if (eventCallbacks.onClose) {
                eventCallbacks.onClose(evt);
            }
        };
        
        wsConnection.onmessage = function(evt) {
            if (eventCallbacks.onMessage) {
                eventCallbacks.onMessage(evt);
            }
        };
        
        wsConnection.onerror = function(evt) {
            console.error('Classic API: WebSocket error', evt);
            if (eventCallbacks.onError) {
                eventCallbacks.onError(evt);
            }
        };
    }

    /**
     * Send a command
     */
    function send(jsonString) {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(jsonString);
        } else {
            console.warn('Classic API: WebSocket not connected, cannot send:', jsonString);
        }
    }

    /**
     * Set event callbacks
     */
    function setCallbacks(callbacks) {
        eventCallbacks.onOpen = callbacks.onOpen || null;
        eventCallbacks.onClose = callbacks.onClose || null;
        eventCallbacks.onMessage = callbacks.onMessage || null;
        eventCallbacks.onError = callbacks.onError || null;
    }

    /**
     * Check if using OpenAPI (always false for this implementation)
     */
    function isUsingOpenAPI() {
        return false;
    }

    /**
     * Close the connection
     */
    function close() {
        if (wsConnection) {
            wsConnection.close();
            wsConnection = null;
        }
    }

    // Public API
    return {
        connect: connect,
        send: send,
        setCallbacks: setCallbacks,
        isUsingOpenAPI: isUsingOpenAPI,
        close: close
    };
})();
