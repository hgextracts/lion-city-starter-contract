import { Contract } from "../mod.ts";
import {
  Assets,
  Emulator,
  Crypto,
  Lucid,
  fromText,
  toUnit,
} from "../../deps.ts";
import { MyNFT1, userMetadataSamples } from "../testData.ts";

// --- Config ---
const MANE_POLICY_ID =
  "a90d1702625ee4ebcee3b3649708cbcbb163f50db9663308acc9650e";
const MANE = fromText("MANE");
const MANE_UNIT = toUnit(MANE_POLICY_ID, MANE);

// --- Helper to generate accounts ---
async function generateAccount(assets: Assets) {
  const seedPhrase = Crypto.generateSeed();
  return {
    seedPhrase,
    address: await new Lucid()
      .selectWalletFromSeed(seedPhrase)
      .wallet.address(),
    assets,
  };
}

// --- Setup Global Emulator ---
const MASTER = await generateAccount({
  lovelace: 1_000_000_000_000n,
  [MANE_UNIT]: 1_000_000_000_000n,
});
const PAYMENT = await generateAccount({
  lovelace: 1_000_000_000_000n,
  [MANE_UNIT]: 1_000_000_000_000n,
});
const USER_0 = await generateAccount({
  lovelace: 1_000_000_000_000n,
  [MANE_UNIT]: 1_000_000_000_000n,
  [toUnit(MyNFT1.policyId, MyNFT1.assetName)]: 1n,
  // [toUnit(MyNFT2.policyId, MyNFT2.assetName)]: 1n,
  // [toUnit(MyNFT3.policyId, MyNFT3.assetName)]: 1n,
  // [toUnit(MyNFT4.policyId, MyNFT4.assetName)]: 1n,
  // [toUnit(MyNFT5.policyId, MyNFT5.assetName)]: 1n,
  // [toUnit(MyNFT6.policyId, MyNFT6.assetName)]: 1n,
  // [toUnit(MyNFT7.policyId, MyNFT7.assetName)]: 1n,
  // [toUnit(MyNFT8.policyId, MyNFT8.assetName)]: 1n,
  // [toUnit(MyNFT9.policyId, MyNFT9.assetName)]: 1n,
  // [toUnit(MyNFT10.policyId, MyNFT10.assetName)]: 1n,
});
const USER_1 = await generateAccount({
  lovelace: 1_000_000_000_000n,
  [MANE_UNIT]: 1_000_000_000_000n,
});

const emulator = new Emulator([MASTER, PAYMENT, USER_0, USER_1]);
const lucid = new Lucid({ provider: emulator });

lucid.selectWalletFromSeed(MASTER.seedPhrase);
const { instanceId } = await new Contract(lucid).deploy("Test", 10000);
emulator.awaitBlock();

const paymentObject = [
  {
    address: PAYMENT.address,
    tokens: [
      { policy_id: null, token_name: null, amount: 60_000_000n },
      { policy_id: MANE_POLICY_ID, token_name: MANE, amount: 100_000_000n },
    ],
  },
  {
    address: PAYMENT.address,
    tokens: [
      { policy_id: null, token_name: null, amount: 5_000_000n },
      { policy_id: MANE_POLICY_ID, token_name: MANE, amount: 10_000_000n },
    ],
  },
];

// --- Tests ---

Deno.test("Start", async () => {
  await new Contract(lucid, instanceId).start(paymentObject);
  emulator.awaitBlock();
});

let mintedIds: number[] = [];

Deno.test("Mint Multiple", async () => {
  lucid.selectWalletFromSeed(USER_0.seedPhrase);
  const contract = new Contract(lucid, instanceId);
  const result = await contract.mint(userMetadataSamples, "lovelace");
  mintedIds = result.mintedIds; // Use mintedUserIds or mintedPixelIds as appropriate
  emulator.awaitBlock();
});

Deno.test("Update Payment Options", async () => {
  lucid.selectWalletFromSeed(MASTER.seedPhrase);
  const contract = new Contract(lucid, instanceId);

  // Create a new payment object for testing update
  const updatedPaymentObject = [
    {
      address: PAYMENT.address,
      tokens: [
        { policy_id: null, token_name: null, amount: 10_000_000n }, // 10 ADA
        { policy_id: MANE_POLICY_ID, token_name: MANE, amount: 50_000_000n }, // 50 MANE
      ],
    },
  ];

  await contract.updatePayments(updatedPaymentObject);
  emulator.awaitBlock();
});

// Deno.test("User Mutate", async () => {
//   lucid.selectWalletFromSeed(USER_0.seedPhrase);
//   const contract = new Contract(lucid, instanceId);

//   await contract.mutateMetadata(mintedIds[0], {
//     name: `Test ${mintedIds[0]}`,
//     image: "ipfs://UpdatedUserImage",
//     description: "Updated by User",
//   });
//   emulator.awaitBlock();
// });

Deno.test("AppWallet Mutate", async () => {
  lucid.selectWalletFromSeed(MASTER.seedPhrase);
  const contract = new Contract(lucid, instanceId);

  await contract.mutateMetadata(mintedIds[1], {
    name: `Test ${mintedIds[1]}`,
    image: "ipfs://UpdatedPixelImage",
    description: "Updated by App",
  });
  emulator.awaitBlock();
});

Deno.test("Mint and burn", async () => {
  lucid.selectWalletFromSeed(USER_0.seedPhrase);
  const contract = new Contract(lucid, instanceId);

  await contract.burn(mintedIds[2]);
  emulator.awaitBlock();
});

Deno.test("Destroy all lanes (15 at a time)", async () => {
  lucid.selectWalletFromSeed(MASTER.seedPhrase);
  const contract = new Contract(lucid, instanceId);

  while ((await contract.getTotalLanes()) > 0) {
    await contract.destroyLanes();
    emulator.awaitBlock();
  }
});

Deno.test("Destroy Payment UTXO", async () => {
  lucid.selectWalletFromSeed(MASTER.seedPhrase);
  const contract = new Contract(lucid, instanceId);

  await contract.destroyPayment();
  emulator.awaitBlock();
});
