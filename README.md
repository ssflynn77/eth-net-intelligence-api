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
Run the following command from a Linux shell and replace the bold arguments with your information.  This will install the software and all prerequisite software, create the configuration file with the arguments provided, start the software, and configure it to be restarted with the computer.

<pre>
curl -sL https://github.com/ssflynn77/eth-net-intelligence-oms/raw/master/bin/install.sh | bash -s <b>RPC_PORT RPC_HOST_IP NODE_ID OMS_WORKSPACE_ID OMS_KEY</b>
</pre>

Example:

```bash
curl -sL https://github.com/ssflynn77/eth-net-intelligence-oms/raw/master/bin/install.sh | bash -s 8545 "10.0.0.4" "node1" "4328ba1e-a081-42b6-b083-051b4ac6c21a" "VSKTH9PueGF9i4UdJacpNQv36VKkcojQfeN6OfAZ4xxLdM8elp90IbsFxNLzG1RbAOPiuCqORfCMv9F2lEQJFg=="
```

## Installation as docker container

There is a `Dockerfile` in the root directory of the repository. Please read through the header of said file for
instructions on how to build/run/setup. Configuration instructions below still apply.

## Configuration

Configure the app by modifying [app.json](/eth-net-intelligence-oms/blob/master/app.json). Note that you have to modify the backup app.json file located in `./app.json` (to allow you to set your env vars without being rewritten when updating).

```json
"env":
	{
		"NODE_ENV"        : "production", // tell the client we're in production environment
		"RPC_HOST"        : "localhost", // eth JSON-RPC host
		"RPC_PORT"        : "8545", // eth JSON-RPC port		
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
cd ~/eth-net-intelligence-oms
pm2 start app.json
```

## Stop
```bash
pm2 stop node-app-oms
```

## View Logs
```bash
pm2 logs node-app-oms
```