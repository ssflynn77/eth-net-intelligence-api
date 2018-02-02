Ethereum Network Intelligence OMS
============

**WARNING - Development in Progress**

**This code is fully unsupported at the moment**

This is a backend service which runs along with ethereum and tracks the network status, fetches information through JSON-RPC and sends the information to an Azure OMS instance.

> Forked from eth-net-intelligence-api at https://github.com/cubedro/eth-net-intelligence-api


## Prerequisite
* Existing geth or Parity client
* Existing Azure OMS Instance
	* [OMS Overview](https://docs.microsoft.com/en-us/azure/operations-management-suite/operations-management-suite-overview) 
	* [Log Analytics Oveview](https://docs.microsoft.com/en-us/azure/log-analytics/)

## Installation script
Run 

## Installation as docker container

There is a `Dockerfile` in the root directory of the repository. Please read through the header of said file for
instructions on how to build/run/setup. Configuration instructions below still apply.

## Configuration

Configure the app modifying [app.json](/eth-net-intelligence-oms/blob/master/app.json). Note that you have to modify the backup app.json file located in `./app.json` (to allow you to set your env vars without being rewritten when updating).

```json
"env":
	{
		"NODE_ENV"        : "production", // tell the client we're in production environment
		"RPC_HOST"        : "localhost", // eth JSON-RPC host
		"RPC_PORT"        : "8545", // eth JSON-RPC port
		"LISTENING_PORT"  : "30303", // eth listening port (only used for display)
		"INSTANCE_NAME"   : "", // whatever you wish to name your node to display in OMS and other Dashboards
		"CONTACT_DETAILS" : "", // add your contact details here if you wish (email/skype)
		"VERBOSITY"       : 2, // Set the verbosity (0 = silent, 1 = error, warn, 2 = error, warn, info, success, 3 = all logs)
		"OMS_WORKSPACE_ID": "", // Can be found in the OMS Portal under Settings / Connected Services
		"OMS_KEY"         : "" // Can be found in the OMS Portal under Settings / Connected Services     
	}
```

## Run

Run it using pm2:

```bash
cd ~/bin
pm2 start app.json
```

## Updating

To update the API client use the following command:

```bash
~/bin/www/bin/update.sh
```

It will stop the current netstats client processes, automatically detect your ethereum implementation and version, update it to the latest develop build, update netstats client and reload the processes.