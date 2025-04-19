# 🦁🏙️ Lion City Minting Contract

<p align="center">
  <img src="https://img.shields.io/badge/Smart_Contract-Aiken-blue" />
  <img src="https://img.shields.io/badge/OffChain-Lucid-yellow" />
  <img src="https://img.shields.io/badge/Standard-CIP--68-green" />
  <img src="https://img.shields.io/badge/Feature-Minting_Lanes-purple" />
  <img src="https://img.shields.io/badge/Cardano-Preprod/Mainnet-orange" />
</p>

This is the **Lion City** smart contract for scalable, customizable NFT minting on the Cardano blockchain.

It is built using **Aiken** + **Lucid**, and is designed to support **minting lanes**, **multi-asset payments (ADA or tokens)**, **mutatable metadata (CIP-68)**, and **safe closure mechanisms**.

---

## ✨ Features

- **Minting Lanes Model**  
  Scale minting across 100 "lanes" to avoid Cardano concurrency bottlenecks and allow parallel NFT minting.

- **Flexible Multi-Asset Payment**  
  Accept payments in **ADA** and/or **custom tokens** (e.g., $MANE, $USDM, $SNEK).

- **Dynamic Payment Updates**  
  Update accepted payment assets **after deployment** using the **Ownership** token — no redeploy required.

- **Mutatable Metadata (CIP-68)**  
  Built-in support for **app-side** metadata updates.

  - 🛠️ **App Mutations**: Admin-controlled upgrades, states, or visual changes.
  - ✅ **Versioning enforced** for metadata integrity and auditability.

- **Safe Closure Mechanisms**  
  Finish and clean up minting operations when supply is exhausted:

  - `destroyLanes`: Burns all 100 Lane tokens.
  - `destroyPayment`: Burns the payment record and Ownership token to finalize the mint.

- **Secure and Auditable Architecture**
  - Type-safe structures (`LaneDatum`, `Payments`, `MetadataDatum`) on-chain.
  - Safe randomness and mint routing using input hashes.
  - Script-enforced restrictions on who can mutate metadata or update payment state.

---

## ⚙️ Lifecycle Functions

| Function                             | Purpose                                                            |
| :----------------------------------- | :----------------------------------------------------------------- |
| `deploy(name, totalSupply)`          | Deploy mint infrastructure (lanes, payment token, ownership token) |
| `start(payments)`                    | Lock initial payments (ADA or tokens)                              |
| `mint(metadataArray, paymentOption)` | Mint NFTs, pay with specified unit                                 |
| `appMutateMetadata(id, newMetadata)` | Update metadata for an NFT using the AppWallet token               |
| `updatePayments(newPayments)`        | Replace the on-chain payment configuration using Value maps        |
| `burn(id)`                           | Burn both 100 + 222 tokens of a given NFT                          |
| `destroyLanes()`                     | Burn all 100 minting lanes (must be empty)                         |
| `destroyPayment()`                   | Burn payment datum + Ownership token to close mint                 |

---

## 🚀 Quick Start

To develop or test this contract locally, follow this setup:

### 🛠 Requirements

- [Deno](https://deno.land/)
- [Aiken](https://aiken-lang.org/docs/install) (must be installed globally)
- Git + Bash/Zsh (for CLI usage)

> 🧠 _Aiken is not bundled — users must install it manually before running build commands._

---

### 📦 Common Dev Workflow

Once you’ve cloned the repo and installed Aiken:

🔍 Type check the Aiken contract

```bash
deno task test:contract
```

🔨 Compile contract (generates .mlir, .plutus files)

```bash
deno task build:contract
```

📘 Generate Lucid-compatible blueprint (Plutus.json)

```bash
deno task blueprint
```

✅ Run the full test suite with emulator

```bash
deno task test
```

---

## 🧪 Tests

This contract includes a full suite of tests using **Lucid's Emulator** with Deno:

- ✅ `tests/mod.test.ts` – covers valid lifecycle:

  - Deploy
  - Mint
  - Mutate
  - Destroy

- 🛑 `tests/fail.test.ts` – covers intentional failure cases like:
  - Mutating without proper tokens
  - Minting without payment
  - Destroying lanes before mint is complete

### 🔁 Run Tests

```bash
deno task test
```

---

### 🧾 Metadata Array

When calling `mint(metadataArray, paymentUnit)`:

- Each entry in `metadataArray` represents **one NFT**.
- The contract supports **batch minting** — tested up to **10 NFTs per transaction**.
- Each minted NFT includes:
  - A **CIP-68 reference token** (label `100`)
  - A **user token** (label `222`)

---

### 🛣 Minting Lanes

To prevent **Cardano concurrency issues**, this contract mints across **100 lanes**:

- Each lane is a UTXO that tracks a **range of token IDs** and a **counter**.
- **Collections must be divisible by 100**, with a **minimum size of 100**.
  - `100 NFTs` → 1 per lane (max **1 mint per transaction**)
  - `10,000 NFTs` → 100 per lane (up to **10 mints per transaction**)
- Once all lanes are used:
  - ✅ Call `destroyLanes()` to clean up.
  - ⚠️ **Destroyed lanes cannot be recovered** — this is a final operation.

---

### 🧠 AppWallet Token

A special **AppWallet token** is minted at deploy time and intended to be held by the application's wallet.

- Holding this token allows the dApp to:
  - Perform **App Mutations** on metadata (e.g., upgrade traits, set state)

**Use Cases**:

- Game stat progression
- Trait unlocks
- Soulbound data
- Off-chain sync for app-controlled logic

Only the **wallet holding the AppWallet token** can modify `MetadataDatum`.

---

### 💸 Payment Token System

This contract supports **multi-asset payments**, including **ADA** and **custom tokens** (like `$MANE`, `$USDM`, or other project tokens).

You configure payments using `start()` or `updatePayments()` with a `PaymentInput[]` array:

```ts
const paymentObject = [
  {
    address: "addr1...", // Receiver
    tokens: [
      { policy_id: null, token_name: null, amount: 5_000_000n },        // 5 ADA
      { policy_id: "abcd...", token_name: "MANE", amount: 10_000_000n } // 10 MANE
    ]
  },
  ...
];
```

**Rules:**

- `token.amount` = price **per NFT**
- Example: minting 2 NFTs with `5_000_000n` = **10 ADA** total
- `policy_id` + `token_name` = `null` → represents **ADA (lovelace)**
- Users select the payment unit by passing:
  - `"lovelace"` for ADA
  - `toUnit(policyId, tokenName)` for token-based payments

✅ The smart contract ensures:

- Correct amount is paid
- Receiver receives the funds
- Payment scales with the number of NFTs minted

---

## 🌍 Project Vision

**Lion City** is an open-source contract framework designed to make NFT minting on **Cardano** scalable, modular, and dev-friendly.

From collectible drops to dynamic dApps, this system adapts with your project’s needs.

---

## ⚠️ Note for Builders

This smart contract is provided as a **starter template**. While it covers many core features needed for scalable NFT minting on Cardano, your project may require adjustments or extensions, including:

- Custom payment logic
- More granular metadata validation
- Integration with external game or dApp logic
- Access control and multi-signer roles

You are encouraged to fork, adapt, and extend the contract as needed. The current version reflects **Lion City's open-source Starter contract**, built for clarity, not maximum feature complexity.

---

## 📜 License

This project is provided for **educational and reference purposes only**.
No warranties or guarantees of functionality, security, or fitness for any particular purpose are provided.

Use at your own risk.
Commercial usage must **credit Lion City** and **respect the original project effort**.

**All Rights Reserved © 2025 Lion City**

```

```
