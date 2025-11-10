ARG BUILD_FROM
FROM $BUILD_FROM

# Copy ProWebRemote files from local directory
COPY ProWebRemote/ /var/www/html/

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Note: nginx and jq are installed at runtime to avoid network dependency during build

CMD [ "/run.sh" ]
