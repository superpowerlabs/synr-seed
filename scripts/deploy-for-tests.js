// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
require("dotenv").config();
const hre = require("hardhat");
const requireOrMock = require("require-or-mock");
const ethers = hre.ethers;
const deployed = requireOrMock("export/deployed.json");
const DeployUtils = require("./lib/DeployUtils");

let deployUtils;

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {Tx} = deployUtils;
  const chainId = await deployUtils.currentChainId();

  let [, localTokenOwner, localSuperAdmin] = await ethers.getSigners();

  const tokenOwner = localTokenOwner.address;
  const superAdmin = localSuperAdmin.address;
  const maxTotalSupply = process.env.MAX_TOTAL_SUPPLY || 10000000000;

  const synr = await deployUtils.deploy("SyndicateERC20", tokenOwner, maxTotalSupply, superAdmin);

  let features =
    (await synr.FEATURE_TRANSFERS_ON_BEHALF()) +
    (await synr.FEATURE_TRANSFERS()) +
    (await synr.FEATURE_UNSAFE_TRANSFERS()) +
    (await synr.FEATURE_DELEGATIONS()) +
    (await synr.FEATURE_DELEGATIONS_ON_BEHALF());

  await deployUtils.Tx(synr.updateFeatures(features));

  const sSynr = await deployUtils.deploy("SyntheticSyndicateERC20", superAdmin);

  // pass

  const validator = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

  const operators = ["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"];

  const pass = await deployUtils.deploy("SynCityPasses", validator);
  await deployUtils.Tx(pass.setOperators(operators));

  let pool;

  pool = await deployUtils.deployProxy("MainPool", synr.address, sSynr.address, deployed[chainId].SynCityPasses);
  await deployUtils.Tx(sSynr.updateRole(pool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER()), "Whitelisting the pool");
  await deployUtils.Tx(pool.initPool(7, 4000, {gasLimit: 70000}), "Init main pool");

  const seed = await deployUtils.deploy("SeedToken");

  pool = await deployUtils.deployProxy("SeedPool", deployed[chainId].SeedToken, deployed[chainId].SynCityCoupons);
  await deployUtils.Tx(pool.initPool(1000, 7 * 24 * 3600, 9800, 1000, 100, 800, 3000, 10, {gasLimit: 90000}), "Init SeedPool");
  await deployUtils.Tx(pool.updateNftConf(100000, 1500, 500000, 150, 1000, {gasLimit: 60000}), "Init NFT Conf");
  await deployUtils.Tx(seed.grantRole(await seed.MINTER_ROLE(), pool.address), "Granting the pool minting role for SeedToken");

  // test cases
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
