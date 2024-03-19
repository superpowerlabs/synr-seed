const {requirePath} = require("require-or-mock");
// if missed, it sets up a mock
requirePath(".env");

require("dotenv").config();
require("cryptoenv").parse({
  noLogsIfNoKeys: true,
});

require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");
require("@openzeppelin/hardhat-upgrades");
require("solidity-coverage");
// Go to https://hardhat.org/config/ to learn more

if (process.env.GAS_REPORT === "yes") {
  require("hardhat-gas-reporter");
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.11",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {},
  networks: {
    localhost: {
      url: "http://localhost:8545",
      chainId: 1337,
    },
    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.ETH_MAINNET],
      chainId: 1,
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      chainId: 56,
      // gasPrice: 20000000000,
      accounts: [process.env.BNB_MAINNET],
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`,
      gasLimit: 6000000,
      accounts: [process.env.FOR_TESTNET],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      gasLimit: 6000000,
      accounts: [process.env.FOR_TESTNET],
    },
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      // gasPrice: 20000000000,
      gasLimit: 6000000,
      accounts: [process.env.FOR_TESTNET],
    },
    mumbai: {
      url: "https://rpc.ankr.com/polygon_mumbai",
      chainId: 80001,
      gasPrice: 20000000000,
      gasLimit: 6000000,
      accounts: [process.env.FOR_TESTNET],
    },
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      gasPrice: 225000000000,
      chainId: 43113,
      accounts: [process.env.FOR_TESTNET],
    },
    avalance: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      gasPrice: 225000000000,
      chainId: 43114,
      accounts: [process.env.FOR_TESTNET],
    },
    alfajores: {
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: [process.env.FOR_TESTNET],
      chainId: 44787,
    },
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP,
  },
  etherscan: {
    // apiKey: process.env.BSCSCAN_KEY,
    apiKey: process.env.ETHERSCAN_KEY,
  },
};
