# Set variables
RPC_HOST=$1;
RPC_PORT=$2;
NODE_ID=$3;
OMS_WORKSPACE_ID=$4;
OMS_KEY=$5;

# update packages
sudo apt-get update 
sudo apt-get install -y curl git-core

# Install Node and Nodejs
#curl -sL https://deb.nodesource.com/setup_9.x | bash -
sudo apt-get update
sudo apt-get install -y nodejs

# Download eth-net-intelligence-oms
cd ~
git clone https://github.com/ssflynn77/eth-net-intelligence-oms.git
cd eth-net-intelligence-oms
npm install
sudo npm install -g pm2

# Edit the values in the app.json file according to http://pm2.keymetrics.io/docs/usage/application-declaration/
cat app.json | jq "\
	.[0].env.RPC_PORT = \"$RPC_HOST\" | \
	.[0].env.RPC_HOST = \"$RPC_PORT\" | \
	.[0].env.INSTANCE_NAME = \"$NODE_ID\" | \
	.[0].env.OMS_WORKSPACE_ID = \"$OMS_WORKSPACE_ID\" | \
	.[0].env.OMS_KEY = \"$OMS_KEY\"" \
	> app1.json

mv app1.json app.json

# Start the program
pm2 start app.json

# Make PM2 restart when host restarts - http://pm2.keymetrics.io/docs/usage/startup/
sudo pm2 startup