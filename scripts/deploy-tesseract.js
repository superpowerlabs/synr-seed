require("dotenv").config();
const hre = require("hardhat");

const ethers = hre.ethers;
const deployed = require("../export/deployed.json");
const DeployUtils = require("./lib/DeployUtils");

let deployUtils;

const {
  rewardsFactor,
  decayInterval,
  decayFactor,
  swapFactor,
  stakeFactor,
  taxPoints,
  coolDownDays,
  minimumLockupTime,
  earlyUnstakePenalty,
  sPSynrEquivalent,
  sPBoostFactor,
  sPBoostLimit,
  bPSynrEquivalent,
  bPBoostFactor,
  bPBoostLimit,
} = require("./parameters");

async function main() {
  deployUtils = new DeployUtils(ethers);
  const {network} = deployUtils;
  const chainId = await deployUtils.currentChainId();
  const [owner] = await ethers.getSigners();

  let pool;

  const isMainChain = chainId === 1 || chainId === 44787;

  console.log("Deploying contracts with the account:", owner.address, "to", network(chainId));

  if (isMainChain) {
    const sSynr = await deployUtils.attach("SyntheticSyndicateERC20");
    pool = await deployUtils.deployProxy(
      "MainPool",
      deployed[chainId].SyndicateERC20,
      sSynr.address,
      deployed[chainId].SynCityPasses
    );
    // pool = await deployUtils.attach("MainPool");
    await deployUtils.Tx(
      sSynr
        .connect(owner)
        .updateRole(pool.address, await sSynr.ROLE_WHITE_LISTED_RECEIVER(), chainId === 1337 ? {} : {gasLimit: 60000}),
      "Whitelisting the pool"
    );
    await deployUtils.Tx(
      pool.initPool(minimumLockupTime, earlyUnstakePenalty, chainId === 1337 ? {} : {gasLimit: 70000}),
      "Init main pool"
    );
  } else {
    const seed = await deployUtils.attach("SeedToken");
    const poolViews = await deployUtils.deployProxy("SidePoolViews");
    pool = await deployUtils.deployProxy(
      "SeedPool",
      deployed[chainId].SeedToken,
      deployed[chainId].SynCityCoupons,
      poolViews.address
    );
    // pool = await deployUtils.attach("SeedPool");
    await deployUtils.Tx(
      pool.initPool(
        rewardsFactor,
        decayInterval,
        decayFactor,
        swapFactor,
        stakeFactor,
        taxPoints,
        coolDownDays,
        chainId === 1337
          ? {}
          : {
              gasLimit: 120000,
            }
      ),
      "Init SeedPool"
    );
    await deployUtils.Tx(
      pool.updateExtraConf(
        sPSynrEquivalent,
        sPBoostFactor,
        sPBoostLimit,
        bPSynrEquivalent,
        bPBoostFactor,
        bPBoostLimit,
        chainId === 1337
          ? {}
          : {
              gasLimit: 90000,
            }
      ),
      "Init ExtraConf"
    );
    await deployUtils.Tx(seed.setMinter(pool.address, true), "Granting the pool minting role for SeedToken");
  }

  const tesseract = await deployUtils.deployProxy("Tesseract");

  const bridgeName = isMainChain ? "MainWormholeBridge" : "SideWormholeBridge";
  const bridge = await deployUtils.deployProxy(bridgeName, tesseract.address, pool.address);

  await deployUtils.Tx(pool.setBridge(bridge.address, true), "Set bridge in pool");
  await deployUtils.Tx(tesseract.setBridge(1, bridge.address), "Set bridge in tesseract");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
