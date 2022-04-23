#!/usr/bin/env bash
# must be run from the root

MAIN_NETWORK=localhost
SIDE_NETWORK=localhost

if [[ "$1" == "testnet" ]]; then
MAIN_NETWORK=ropsten
SIDE_NETWORK=bsc_testnet
fi

if [[ "$1" == "mainnet" ]]; then
MAIN_NETWORK=ethereum
SIDE_NETWORK=bsc
fi

echo "Deploying pools to $MAIN_NETWORK and $SIDE_NETWORK..."

npx hardhat run scripts/deploy-mainpool.js --network $MAIN_NETWORK
npx hardhat run scripts/deploy-bridge.js --network $MAIN_NETWORK

npx hardhat run scripts/deploy-seedpool.js --network $SIDE_NETWORK
npx hardhat run scripts/deploy-factory.js --network $SIDE_NETWORK

npx hardhat run scripts/deploy-wormhole.js --network $MAIN_NETWORK
npx hardhat run scripts/deploy-wormhole.js --network $SIDE_NETWORK

