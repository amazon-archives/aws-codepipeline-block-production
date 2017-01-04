#!/bin/bash

for i in `seq 1 10`;
do
  HTTP_CODE=`/usr/bin/curl --write-out '%{http_code}' -o /dev/null -m 10 -q -s http://localhost:80`
  if [ "$HTTP_CODE" == "200" ]; then
    /bin/echo "Successfully pulled root page."
    exit 0;
  fi
  /bin/echo "Attempt to curl endpoint returned HTTP Code $HTTP_CODE. Backing off and retrying."
  /bin/sleep 10
done
/bin/echo "Server did not come up after expected time. Failing."
exit 1
