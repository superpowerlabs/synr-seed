#!/usr/bin/env bash

npx hardhat flatten contracts/$1.sol > ./$1-flatten.sol