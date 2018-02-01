## Dockerfile for eth-net-intelligence-omsi (build from git).
##
## Build via:
#
# `docker build -t ethnetoms:latest .`
#
## Run via:
#
# `docker run -v <path to app.json>:/home/ethnetoms/eth-net-intelligence-oms/app.json ethnetoms:latest`
#
## Make sure, to mount your configured 'app.json' into the container at
## '/home/ethnetoms/eth-net-intelligence-oms/app.json', e.g.
## '-v /path/to/app.json:/home/ethnetoms/eth-net-intelligence-oms/app.json'
## 
## Note: if you actually want to monitor a client, you'll need to make sure it can be reached from this container.
##       The best way in my opinion is to start this container with all client '-p' port settings and then 
#        share its network with the client. This way you can redeploy the client at will and just leave 'ethnetoms' running. E.g. with
##       the python client 'pyethapp':
##
#
# `docker run -d --name ethnetoms \
# -v /home/user/app.json:/home/ethnetoms/eth-net-intelligence-oms/app.json \
# -p 0.0.0.0:30303:30303 \
# -p 0.0.0.0:30303:30303/udp \
# ethnetoms:latest`
#
# `docker run -d --name pyethapp \
# --net=container:ethnetoms \
# -v /path/to/data:/data \
# pyethapp:latest`
#
## If you now want to deploy a new client version, just redo the second step.


FROM ubuntu

RUN apt-get update &&\
    apt-get install -y curl git-core &&\
    curl -sL https://deb.nodesource.com/setup_9.x | bash - &&\
    apt-get update &&\
    apt-get install -y nodejs

RUN adduser ethnetoms

RUN cd /home/ethnetoms &&\
    git clone https://github.com/ssflynn77/eth-net-intelligence-oms.git &&\
    cd eth-net-intelligence-oms &&\
    npm install &&\
    npm install -g pm2

RUN echo '#!/bin/bash\nset -e\n\ncd /home/ethnetoms/eth-net-intelligence-oms\n/usr/bin/pm2 start ./app.json\ntail -f \
    /home/ethnetoms/.pm2/logs/node-app-out-0.log' > /home/ethnetoms/startscript.sh

RUN chmod +x /home/ethnetoms/startscript.sh &&\
    chown -R ethnetoms. /home/ethnetoms

USER ethnetoms
ENTRYPOINT ["/home/ethnetoms/startscript.sh"]
