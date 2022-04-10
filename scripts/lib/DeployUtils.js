const path = require("path");
const fs = require("fs-extra");
const {Contract} = require("@ethersproject/contracts");
const abi = require("ethereumjs-abi");

const oZChainName = {
  1337: "unknown-1337",
  1: "mainnet",
  3: "ropsten",
  56: "bsc",
  97: "bsc_testnet",
};

const scanner = {
  1337: "localhost",
  1: "etherscan.io",
  3: "ropsten.etherscan.io",
  56: "bscscan.com",
  97: "testnet.bscscan.com",
};

class DeployUtils {
  constructor(ethers) {
    this.ethers = ethers;
  }

  async sleep(millis) {
    // eslint-disable-next-line no-undef
    return new Promise((resolve) => setTimeout(resolve, millis));
  }

  getProviders() {
    const {INFURA_API_KEY} = process.env;

    const rpc = (url) => {
      return new this.ethers.providers.JsonRpcProvider(url);
    };

    let providers = {
      1337: this.ethers.getDefaultProvider("http://localhost:8545"),
    };

    if (INFURA_API_KEY) {
      providers = Object.assign(providers, {
        1: rpc(`https://mainnet.infura.io/v3/${INFURA_API_KEY}`),
        3: rpc(`https://ropsten.infura.io/v3/${INFURA_API_KEY}`),
        4: rpc(`https://rinkeby.infura.io/v3/${INFURA_API_KEY}`),
        5: rpc(`https://goerli.infura.io/v3/${INFURA_API_KEY}`),
      });
    }

    return providers;
  }

  async getABI(name, folder) {
    const fn = path.resolve(__dirname, `../../artifacts/contracts/${folder}/${name}.sol/${name}.json`);
    if (fs.pathExists(fn)) {
      return JSON.parse(await fs.readFile(fn, "utf8")).abi;
    }
  }

  async getContract(name, folder, address, chainId) {
    return new Contract(address, await this.getABI(name, folder), this.getProviders()[chainId]);
  }

  async currentChainId() {
    return (await this.ethers.provider.getNetwork()).chainId;
  }

  async saveDeployed(chainId, names, addresses, extras) {
    if (names.length !== addresses.length) {
      throw new Error("Inconsistent arrays");
    }
    const deployedJson = path.resolve(__dirname, "../../export/deployed.json");
    if (!(await fs.pathExists(deployedJson))) {
      await fs.ensureDir(path.dirname(deployedJson));
      await fs.writeFile(deployedJson, "{}");
    }
    const deployed = JSON.parse(await fs.readFile(deployedJson, "utf8"));
    if (!deployed[chainId]) {
      deployed[chainId] = {};
    }
    const data = {};
    for (let i = 0; i < names.length; i++) {
      data[names[i]] = addresses[i];
    }
    deployed[chainId] = Object.assign(deployed[chainId], data);

    if (extras) {
      // data needed for verifications
      if (!deployed.extras) {
        deployed.extras = {};
      }
      if (!deployed.extras[chainId]) {
        deployed.extras[chainId] = {};
      }
      deployed.extras[chainId] = Object.assign(deployed.extras[chainId], extras);
    }
    // console.log(deployed)
    await fs.writeFile(deployedJson, JSON.stringify(deployed, null, 2));
  }

  encodeArguments(parameterTypes, parameterValues) {
    return abi.rawEncode(parameterTypes, parameterValues).toString("hex");
  }

  async verifyCodeInstructions(name, chainId, types, values, contract) {
    const oz = JSON.parse(await fs.readFile(path.resolve(__dirname, "../../.openzeppelin", oZChainName[chainId] + ".json")));
    let address
    LOOP: for (let key in oz.impls) {
      let storage = oz.impls[key].layout.storage
      for  (let s of storage) {
        if (s.contract === contract) {
          address = oz.impls[key].address
          break LOOP
        }
      }
    }

    let response = `To verify ${name} source code, flatten the source code, get the implementation address in .openzeppelin, remove the licenses, except the first one, and verify manually at 
    
https://${scanner[chainId]}/address/${address}    

${values.length ? `The encoded arguments are:

${this.encodeArguments(types, values)}` : ""}
`;
    const logDir = path.resolve(__dirname, "../../log");
    await fs.ensureDir(logDir);
    const shortDate = (new Date).toISOString().substring(5, 16)
    const fn = [name, chainId, shortDate].join('_') + ".log";
    await fs.writeFile(path.resolve(logDir, fn), response);

    return `${response}
    
Info saved in:
    
    log/${fn}
`;
  }
}

module.exports = DeployUtils;
