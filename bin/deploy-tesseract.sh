#!/usr/bin/env bash
# must be run from the root

npx hardhat compile

npx hardhat run scripts/deploy-tesseract.js --network $1

if [[ "$1" == "goerli" || "$1" == "ethereum" ]]; then
  ./bin/flatten.sh Tesseract
  ./bin/flatten.sh MainWormholeBridge bridge
  ./bin/flatten.sh MainPool pool
else
  ./bin/flatten.sh SideWormholeBridge bridge
  ./bin/flatten.sh SeedPool pool
fi

