#!/bin/bash

set -e

/bin/mkdir -p /var/codedeploy/tomcat-sample

/bin/cat <<EOF >/var/codedeploy/tomcat-sample/env.properties
APPLICATION_NAME=$APPLICATION_NAME
DEPLOYMENT_GROUP_NAME=$DEPLOYMENT_GROUP_NAME
DEPLOYMENT_ID=$DEPLOYMENT_ID
EOF
