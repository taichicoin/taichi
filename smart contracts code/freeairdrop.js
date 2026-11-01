const { ethers } = require("ethers");
const fs = require("fs");
require("dotenv").config();

async function main() {
  // ===== 按你的 .env 变量名读取 =====
  const rpc = process.env.RPC;
  const pk = process.env.PRIVKEY;

  if (!rpc) throw new Error("环境变量 RPC 未设置");
  if (!pk) throw new Error("环境变量 PRIVKEY 未设置");

  const cleanPk = pk.trim().replace(/^["']|["']$/g, "");
  const normalizedPk = cleanPk.startsWith("0x") ? cleanPk : "0x" + cleanPk;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPk)) {
    throw new Error(
      `PRIVKEY 格式不正确：应为 0x + 64 位十六进制（当前长度 ${normalizedPk.length}）。` +
      `请确认填的是完整私钥。`
    );
  }

  // ===== 连接 BSC 主网（ethers v5）=====
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(normalizedPk, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`部署账户: ${wallet.address}`);
  console.log(`账户 BNB 余额: ${ethers.utils.formatEther(balance)} BNB`);
  if (balance.isZero()) throw new Error("账户没有 BNB，无法支付部署 GAS");

  // ===== 读取编译产物 =====
  const abiPath = "./f_sol_NFTHolderAirdrop.abi";
  const binPath = "./f_sol_NFTHolderAirdrop.bin";
  if (!fs.existsSync(abiPath) || !fs.existsSync(binPath)) {
    throw new Error("找不到 ABI 或 BIN 文件，请确认已运行 solcjs 编译");
  }
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const bytecode = "0x" + fs.readFileSync(binPath, "utf8").trim();

  // ===== 部署（构造函数无参数）=====
  console.log("正在部署合约，请稍候...");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();

  console.log(`交易哈希: ${contract.deployTransaction.hash}`);
  console.log("等待链上确认...");

  await contract.deployed();

  console.log("========================================");
  console.log(`✅ 合约部署成功！`);
  console.log(`合约地址: ${contract.address}`);
  console.log(`BscScan: https://bscscan.com/address/${contract.address}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error("❌ 部署失败：", error.message || error);
  process.exitCode = 1;
});
