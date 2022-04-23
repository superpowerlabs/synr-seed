#!/usr/bin/env bash
# must be run from the root

npx hardhat compile

node scripts/exportABIs.js
cp export/ABIs.json ../syn-staking/src/config/.
cp export/deployed.json ../syn-staking/src/config/.
