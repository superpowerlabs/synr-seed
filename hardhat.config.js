const {requirePath} = require('require-or-mock')
// if missed, it sets up a mock
requirePath('.env')
requirePath('.env.json')

require('dotenv').config()
require("@nomiclabs/hardhat-waffle");
require('hardhat-contract-sizer')
require("@nomiclabs/hardhat-etherscan");
require('@openzeppelin/hardhat-upgrades');
// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

if (process.env.GAS_REPORT === 'yes') {
  require("hardhat-gas-reporter");
}

const envJson = require('./.env.json')

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.11",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
    },
  },
  paths: {

  },
  networks: {
    localhost: {
      url: "http://localhost:8545",
      chainId: 1337,
    },
    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY || ''}`,
      accounts: [envJson.ethereum.privateKey],
      chainId: 1,
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY || ''}`,
      accounts: [envJson.kovan.privateKey],
      chainId: 42,
    },
  },
  gasReporter: {
    currency: 'USD',
    coinmarketcap: process.env.coinmarketcap
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY
  }
};

