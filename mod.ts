import {
  concat,
  Data,
  fromText,
  Lucid,
  sha256,
  toHex,
  toUnit,
  Tx,
  Script,
  fromUnit,
} from "./deps.ts";
import * as D from "./types.ts";
import {
  asyncFilter,
  fromAddress,
  fromNumber,
  hashOutRef,
  hashToNumber,
  instanceAlreadyDeployedError,
  instanceIdToStruct,
  instanceMissingError,
  parseEdition,
  randomArrayItem,
  toAddress,
  tokensToValue,
} from "./utils.ts";
import {
  MintingPolicyMintingPolicyMint,
  MetadataControlMetadataValidatorSpend,
  ControlPolicyControlPolicyMint,
  PaymentControlPaymentControlSpend,
  MintingPolicyMintingPolicySpend,
} from "./contract/plutus.ts";

// const ADA_POLICY_ID =
//   "00000000000000000000000000000000000000000000000000000000";

export class Contract {
  lucid: Lucid;
  instanceId?: string;
  policy!: Script;
  policyId!: string;
  baseName!: string;
  perLane!: bigint;
  metadataValidator!: Script;
  metadataAddress!: string;
  controlPolicy!: Script;
  controlPolicyId!: string;
  controlAddress!: string;
  paymentValidator!: Script;
  paymentAddress!: string;

  constructor(lucid: Lucid, instanceId?: string) {
    this.lucid = lucid;
    this.instanceId = instanceId;
    if (this.instanceId) {
      this._instantiate(this.instanceId);
    }
  }

  _instantiate(instanceId: string) {
    const struct = instanceIdToStruct(instanceId);

    this.controlPolicy = new ControlPolicyControlPolicyMint({
      transactionId: struct.txHash,
      outputIndex: BigInt(struct.outputIndex),
    });
    this.controlPolicyId = this.lucid.newScript(this.controlPolicy).toHash();

    this.metadataValidator = new MetadataControlMetadataValidatorSpend(
      this.controlPolicyId
    );
    this.metadataAddress = this.lucid.utils.scriptToAddress(
      this.metadataValidator
    );

    this.paymentValidator = new PaymentControlPaymentControlSpend(
      this.controlPolicyId
    );
    this.paymentAddress = this.lucid.utils.scriptToAddress(
      this.paymentValidator
    );

    this.policy = new MintingPolicyMintingPolicyMint(
      this.controlPolicyId,
      fromAddress(this.metadataAddress)
    );
    this.policyId = this.lucid.newScript(this.policy).toHash();
    this.controlAddress = this.lucid.utils.scriptToAddress(this.policy);

    this.baseName = struct.baseName;
    this.perLane = BigInt(struct.perLane);
  }

  async deploy(name: string, totalSupply: number) {
    if (this.instanceId) throw instanceAlreadyDeployedError;
    if (totalSupply % 100 !== 0 || totalSupply < 100) {
      throw new Error(
        "Total supply must be divisible by 100 and at least 100."
      );
    }

    const perLane = totalSupply / 100;
    const [utxo] = await this.lucid.wallet.getUtxos();
    const instanceId = `${utxo.txHash}-${utxo.outputIndex}-${fromText(
      name
    )}-${perLane}`;
    this._instantiate(instanceId);

    return {
      txHash: await this.lucid
        .newTx()
        .collectFrom([utxo])
        .mint(
          {
            [toUnit(this.controlPolicyId, fromText("Lane"))]: 100n,
            [toUnit(this.controlPolicyId, fromText("Payment"))]: 1n,
            [toUnit(this.controlPolicyId, fromText("Ownership"))]: 1n,
            [toUnit(this.controlPolicyId, fromText("AppWallet"))]: 1n,
          },
          Data.to<D.ControlAction>("Initialize", D.ControlAction)
        )
        .compose(
          [...Array(100)].reduce(
            (tx: Tx, _, index) =>
              tx.payToContract(
                this.controlAddress,
                {
                  Inline: Data.to(
                    {
                      base: BigInt(index * perLane),
                      counter: 0n,
                      maxId: BigInt(index * perLane + perLane),
                    },
                    MintingPolicyMintingPolicySpend.datum
                  ),
                },
                { [toUnit(this.controlPolicyId, fromText("Lane"))]: 1n }
              ),
            this.lucid.newTx()
          )
        )
        .attachScript(this.controlPolicy)
        .commit()
        .then((tx) => tx.sign().commit())
        .then((tx) => tx.submit()),
      instanceId,
    };
  }

  // async start(payments: D.PaymentInput[]): Promise<string> {
  //   if (!this.instanceId) {
  //     throw instanceMissingError;
  //   }
  //   return await this.lucid
  //     .newTx()
  //     .payToContract(
  //       this.paymentAddress,
  //       {
  //         Inline: Data.to<D.Payments>(
  //           payments.map((p) => ({
  //             address: fromAddress(p.address),
  //             tokens: p.tokens,
  //           })),

  //           D.Payments
  //         ),
  //         scriptRef: this.policy,
  //       },
  //       { [toUnit(this.controlPolicyId, fromText("Payment"))]: 1n }
  //     )
  //     .commit()
  //     .then((tx) => tx.sign().commit())
  //     .then((tx) => tx.submit());
  // }
  async start(payments: D.PaymentInput[]): Promise<string> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    // Convert each PaymentInput into a PaymentDatum
    const datum: D.PaymentDatum[] = payments.map((p) => ({
      address: fromAddress(p.address), // Uses Lucid to build valid script address structure
      value: tokensToValue(p.tokens), // Builds the correct Value format (Map<PolicyId, Map<AssetName, Int>>)
    }));

    // 👇 Let Data.to() handle type casting
    const inlineDatum = Data.to(datum, D.Payments);

    console.log("Inline Datum:", inlineDatum);

    return await this.lucid
      .newTx()
      .payToContract(
        this.paymentAddress,
        {
          Inline: inlineDatum, // Casted properly
          scriptRef: this.policy,
        },
        {
          [toUnit(this.controlPolicyId, fromText("Payment"))]: 1n,
        }
      )
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());
  }

  async mint(metadataArray: D.Metadata[], paymentOption: string) {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const utxo = randomArrayItem(await this.lucid.wallet.getUtxos());
    const amount = metadataArray.length;

    const { paymentUtxo, paymentTx } = await this.getPaymentTx(
      paymentOption,
      amount
    );

    const inputHash = await sha256(
      concat([await hashOutRef(utxo), await hashOutRef(paymentUtxo)])
    );
    const randomLane = hashToNumber(toHex(inputHash)) % 100;

    const [laneUtxo] = await asyncFilter(
      await this.lucid.utxosAtWithUnit(
        this.controlAddress,
        toUnit(this.controlPolicyId, fromText("Lane"))
      ),
      async (utxo) => {
        const datum = await this.lucid.datumOf(
          utxo,
          MintingPolicyMintingPolicySpend.datum
        );
        return (
          BigInt(randomLane) === datum.base / this.perLane &&
          datum.base + datum.counter + BigInt(amount) <= datum.maxId
        );
      }
    );

    if (!laneUtxo) {
      throw new Error("No NFT available");
    }

    const laneDatum = await this.lucid.datumOf<D.LaneDatum>(
      laneUtxo,
      D.LaneDatum
    );

    // Initial value before incrementing
    const currentEdition = Number(laneDatum.base + laneDatum.counter);

    laneDatum.counter += BigInt(amount);

    const mintRedeemer = Data.to(
      {
        Minting: [
          { transactionId: utxo.txHash, outputIndex: BigInt(utxo.outputIndex) },
        ],
      },
      MintingPolicyMintingPolicySpend.action
    );

    let tx = this.lucid
      .newTx()
      .readFrom([paymentUtxo])
      .collectFrom([utxo])
      .collectFrom([laneUtxo], mintRedeemer)
      .mint(
        metadataArray.reduce((assets, _metadata, index) => {
          const edition = currentEdition + index;
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 100)
          ] = 1n;
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 222)
          ] = 1n;
          return assets;
        }, {} as Record<string, bigint>),
        Data.to("Mint", MintingPolicyMintingPolicyMint.action)
      )
      .payToContract(
        this.controlAddress,
        { Inline: Data.to<D.LaneDatum>(laneDatum, D.LaneDatum) },
        {
          [toUnit(this.controlPolicyId, fromText("Lane"))]: 1n,
        }
      );

    for (let i = 0; i < metadataArray.length; i++) {
      const edition = currentEdition + i;
      const metadata = metadataArray[i];

      const metadataDatum: D.MetadataDatum = {
        metadata: Data.castFrom<D.Metadata222>(
          Data.fromMetadata(metadata),
          D.Metadata222
        ),
        version: 1n,
        extra: Data.from(Data.void()), // or any default you want
      };

      tx = tx.payToContract(
        this.metadataAddress,
        Data.to(metadataDatum, D.MetadataDatum),
        {
          [toUnit(this.policyId, this.baseName + fromNumber(edition), 100)]: 1n,
        }
      );
    }

    const txHash = await tx
      .compose(paymentTx)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());

    return {
      txHash,
      mintedIds: metadataArray.map((_, i) => currentEdition + i),
    };
  }

  async mutateMetadata(id: number, newMetadata: D.Metadata) {
    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.metadataAddress,
      toUnit(this.policyId, this.baseName + fromNumber(id), 100)
    );
    if (!referenceUtxo) throw new Error("Metadata UTXO not found");

    const walletUtxos = await this.lucid.wallet.getUtxos();
    const signerUtxo = walletUtxos.find((utxo) =>
      Object.keys(utxo.assets).some(
        (unit) => unit === toUnit(this.controlPolicyId, fromText("AppWallet"))
      )
    );
    if (!signerUtxo) throw new Error("AppWallet UTXO not found");

    const datum = await this.lucid.datumOf<D.MetadataDatum>(
      referenceUtxo,
      D.MetadataDatum
    );

    const newDatum: D.MetadataDatum = {
      metadata: Data.castFrom<D.Metadata222>(
        Data.fromMetadata(newMetadata),
        D.Metadata222
      ),
      version: datum.version + 1n,
      extra: datum.extra, // keep the extra field as-is
    };

    await this.lucid
      .newTx()
      .collectFrom([signerUtxo])
      .collectFrom(
        [referenceUtxo],
        Data.to("AppMutation", MetadataControlMetadataValidatorSpend.action)
      )
      .payToContract(this.metadataAddress, Data.to(newDatum, D.MetadataDatum), {
        [toUnit(this.policyId, this.baseName + fromNumber(id), 100)]: 1n,
      })
      .attachScript(this.metadataValidator)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());
  }

  async burn(id: number): Promise<string> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.metadataAddress,
      toUnit(this.policyId, this.baseName + fromNumber(id), 100)
    );

    if (!referenceUtxo) {
      throw new Error("reference NFT not available");
    }

    return await this.lucid
      .newTx()
      .collectFrom(
        [referenceUtxo],
        Data.to("BurnNft", MetadataControlMetadataValidatorSpend.action)
      )
      .mint(
        {
          [toUnit(this.policyId, this.baseName + fromNumber(id), 100)]: -1n,
          [toUnit(this.policyId, this.baseName + fromNumber(id), 222)]: -1n,
        },
        Data.to("Burn", MintingPolicyMintingPolicyMint.action)
      )
      .attachScript(this.policy)
      .attachScript(this.metadataValidator)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());
  }

  async updatePayments(newPayments: D.PaymentInput[]): Promise<string> {
    if (!this.instanceId) throw instanceMissingError;

    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.paymentAddress,
      toUnit(this.controlPolicyId, fromText("Payment"))
    );

    const [ownershipUtxo] = (await this.lucid.wallet.getUtxos()).filter(
      (utxo) =>
        Object.keys(utxo.assets).some(
          (unit) => unit === toUnit(this.controlPolicyId, fromText("Ownership"))
        )
    );

    if (!ownershipUtxo) throw new Error("Ownership token not found.");

    // ✅ Convert PaymentInput[] to correct on-chain representation
    const paymentDatum: D.PaymentDatum[] = newPayments.map((p) => ({
      address: fromAddress(p.address),
      value: tokensToValue(p.tokens),
    }));

    return await this.lucid
      .newTx()
      .collectFrom(
        [paymentUtxo],
        Data.to("Updating", PaymentControlPaymentControlSpend.action)
      )
      .collectFrom([ownershipUtxo])
      .payToContract(
        this.paymentAddress,
        {
          Inline: Data.to(paymentDatum, D.Payments), // ✅ Now safe to call D.Payments
          scriptRef: this.policy,
        },
        {
          [toUnit(this.controlPolicyId, fromText("Payment"))]: 1n,
        }
      )
      .attachScript(this.paymentValidator)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());
  }

  /**
   * Destroy the initial deployed UTxO lanes to claim back the ADA and clean up the ledger.\
   * 15 lines will be destroyed per transaction.\
   * Only do this operation when all lanes reached their max supply!
   */
  async destroyLanes(): Promise<string> {
    const utxos = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.controlPolicyId, fromText("Lane"))
    );

    const [ownershipUtxo] = (await this.lucid.wallet.getUtxos()).filter(
      (utxo) =>
        Object.keys(utxo.assets).some(
          (unit) => unit === toUnit(this.controlPolicyId, fromText("Ownership"))
        )
    );

    if (!ownershipUtxo) throw new Error("No owner found.");

    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.paymentAddress,
      toUnit(this.controlPolicyId, fromText("Payment"))
    );

    if (utxos.length <= 0) throw new Error("All lanes already destroyed.");

    const batch = utxos.slice(0, 15);

    return await this.lucid
      .newTx()
      .readFrom([paymentUtxo])
      .collectFrom([ownershipUtxo])
      .collectFrom(
        batch,
        Data.to("DestroyLanes", MintingPolicyMintingPolicySpend.action)
      )
      .mint(
        {
          [toUnit(this.controlPolicyId, fromText("Lane"))]: -BigInt(
            batch.length
          ),
        },
        Data.to<D.ControlAction>("ShutDown", D.ControlAction)
      )
      .attachScript(this.controlPolicy)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());
  }

  /**
   *  Destroy payment utxo, which holds information about the recipients and holds the minting script.
   *  Only destroy this when the mint is over and after destroying all lanes!
   */
  async destroyPayment(): Promise<string> {
    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.paymentAddress,
      toUnit(this.controlPolicyId, fromText("Payment"))
    );

    if ((await this.getTotalLanes()) > 0) {
      throw new Error("Destroy all lanes first.");
    }

    return await this.lucid
      .newTx()
      .collectFrom(
        [paymentUtxo],
        Data.to("Burning", PaymentControlPaymentControlSpend.action)
      )
      .mint(
        {
          [toUnit(this.controlPolicyId, fromText("Payment"))]: -1n,
          [toUnit(this.controlPolicyId, fromText("Ownership"))]: -1n,
        },
        Data.to("Shutdown", ControlPolicyControlPolicyMint.action)
      )
      .attachScript(this.controlPolicy)
      .attachScript(this.paymentValidator)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());
  }

  async getTotalLanes(): Promise<number> {
    const utxos = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.controlPolicyId, fromText("Lane"))
    );
    return utxos.length;
  }

  async getPaymentTx(paymentOption: string, amount: number) {
    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.paymentAddress,
      toUnit(this.controlPolicyId, fromText("Payment"))
    );

    const paymentsDatum = await this.lucid.datumOf<D.Payments>(
      paymentUtxo,
      D.Payments
    );

    const { policyId, name: assetName } =
      paymentOption === "lovelace"
        ? { policyId: "", name: "" }
        : fromUnit(paymentOption);

    if (assetName === null) {
      throw new Error("Invalid unit: missing asset name for token payment");
    }

    // ✅ Find payments that expect this exact token
    const matchedPayments = paymentsDatum.filter(
      (p) => p.value.get(policyId)?.get(assetName) !== undefined
    );

    if (matchedPayments.length === 0) {
      throw new Error("Selected payment method not available.");
    }

    const paymentTx = this.lucid.newTx();

    for (const p of matchedPayments) {
      const recipient = toAddress(p.address, this.lucid);
      const tokenAmount = p.value.get(policyId)?.get(assetName);

      if (tokenAmount === undefined) {
        throw new Error("Token amount missing for selected unit");
      }

      const unit =
        paymentOption === "lovelace" ? "lovelace" : policyId + assetName;
      const scaledAmount = tokenAmount * BigInt(amount);

      paymentTx.payTo(recipient, { [unit]: scaledAmount });
    }

    return { paymentUtxo, paymentTx };
  }

  // ------------------ Test Failure Helpers ------------------

  async mintFail222ToWrongAddress(
    metadataArray: D.Metadata[],
    paymentOption: string
  ) {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const utxo = randomArrayItem(await this.lucid.wallet.getUtxos());
    const amount = metadataArray.length;

    const { paymentUtxo, paymentTx } = await this.getPaymentTx(
      paymentOption,
      amount
    );

    // --- 🔥 Continue minting NFTs ---
    const inputHash = await sha256(
      concat([await hashOutRef(utxo), await hashOutRef(paymentUtxo)])
    );

    const randomLane = hashToNumber(toHex(inputHash)) % 100;

    const [laneUtxo] = await asyncFilter(
      await this.lucid.utxosAtWithUnit(
        this.controlAddress,
        toUnit(this.controlPolicyId, fromText("Lane"))
      ),
      async (utxo) => {
        const datum = await this.lucid.datumOf(
          utxo,
          MintingPolicyMintingPolicySpend.datum
        );
        return (
          BigInt(randomLane) === datum.base / this.perLane &&
          datum.base + datum.counter + BigInt(amount) <= datum.maxId
        );
      }
    );

    if (!laneUtxo) {
      throw new Error("No NFT available");
    }

    const laneDatum = await this.lucid.datumOf<D.LaneDatum>(
      laneUtxo,
      D.LaneDatum
    );

    laneDatum.counter += BigInt(amount);

    const mintRedeemer = Data.to(
      {
        Minting: [
          { transactionId: utxo.txHash, outputIndex: BigInt(utxo.outputIndex) },
        ],
      },
      MintingPolicyMintingPolicySpend.action
    );

    let tx = this.lucid
      .newTx()
      .readFrom([paymentUtxo])
      .collectFrom([utxo])
      .collectFrom([laneUtxo], mintRedeemer)
      .mint(
        metadataArray.reduce((assets, metadata) => {
          const edition = parseEdition(metadata.name);
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 100)
          ] = 1n;
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 222)
          ] = 1n;
          return assets;
        }, {} as Record<string, bigint>),
        Data.to("Mint", MintingPolicyMintingPolicyMint.action)
      )
      .payToContract(
        this.controlAddress,
        { Inline: Data.to<D.LaneDatum>(laneDatum, D.LaneDatum) },
        {
          [toUnit(this.controlPolicyId, fromText("Lane"))]: 1n,
        }
      );

    for (const metadata of metadataArray) {
      const edition = parseEdition(metadata.name);
      tx = tx.payToContract(
        this.controlAddress,
        Data.to<D.MetadataDatum>(
          {
            metadata: Data.castFrom<D.Metadata222>(
              Data.fromMetadata(metadata),
              D.Metadata222
            ),
            version: 1n,
            extra: Data.from(Data.void()), // or any default you want
          },
          D.MetadataDatum
        ),
        {
          [toUnit(this.policyId, this.baseName + fromNumber(edition), 100)]: 1n,
        }
      );
    }

    const txHash = await tx
      .compose(paymentTx)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());

    return {
      txHash,
      mintedIds: metadataArray.map((meta) => parseEdition(meta.name)),
    };
  }

  async mintFailMissingLaneToken(
    metadataArray: D.Metadata[],
    paymentOption: string
  ) {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const utxo = randomArrayItem(await this.lucid.wallet.getUtxos());
    const amount = metadataArray.length;

    const { paymentUtxo, paymentTx } = await this.getPaymentTx(
      paymentOption,
      amount
    );

    // --- 🔥 Continue minting NFTs ---
    const inputHash = await sha256(
      concat([await hashOutRef(utxo), await hashOutRef(paymentUtxo)])
    );

    const randomLane = hashToNumber(toHex(inputHash)) % 100;

    const [laneUtxo] = await asyncFilter(
      await this.lucid.utxosAtWithUnit(
        this.controlAddress,
        toUnit(this.controlPolicyId, fromText("Lanes"))
      ),
      async (utxo) => {
        const datum = await this.lucid.datumOf(
          utxo,
          MintingPolicyMintingPolicySpend.datum
        );
        return (
          BigInt(randomLane) === datum.base / this.perLane &&
          datum.base + datum.counter + BigInt(amount) <= datum.maxId
        );
      }
    );

    const laneDatum = await this.lucid.datumOf<D.LaneDatum>(
      laneUtxo,
      D.LaneDatum
    );

    laneDatum.counter += BigInt(amount);

    const mintRedeemer = Data.to(
      {
        Minting: [
          { transactionId: utxo.txHash, outputIndex: BigInt(utxo.outputIndex) },
        ],
      },
      MintingPolicyMintingPolicySpend.action
    );

    let tx = this.lucid
      .newTx()
      .readFrom([paymentUtxo])
      .collectFrom([utxo])
      .collectFrom([laneUtxo], mintRedeemer)
      .mint(
        metadataArray.reduce((assets, metadata) => {
          const edition = parseEdition(metadata.name);
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 100)
          ] = 1n;
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 222)
          ] = 1n;
          return assets;
        }, {} as Record<string, bigint>),
        Data.to("Mint", MintingPolicyMintingPolicyMint.action)
      )
      .payToContract(
        this.controlAddress,
        { Inline: Data.to<D.LaneDatum>(laneDatum, D.LaneDatum) },
        {
          [toUnit(this.controlPolicyId, fromText("Lane"))]: 1n,
        }
      );

    for (const metadata of metadataArray) {
      const edition = parseEdition(metadata.name);
      tx = tx.payToContract(
        this.metadataAddress,
        Data.to<D.MetadataDatum>(
          {
            metadata: Data.castFrom<D.Metadata222>(
              Data.fromMetadata(metadata),
              D.Metadata222
            ),
            version: 1n,
            extra: Data.from(Data.void()), // or any default you want
          },
          D.MetadataDatum
        ),
        {
          [toUnit(this.policyId, this.baseName + fromNumber(edition), 100)]: 1n,
        }
      );
    }

    const txHash = await tx
      .compose(paymentTx)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());

    return {
      txHash,
      mintedIds: metadataArray.map((meta) => parseEdition(meta.name)),
    };
  }

  async mintFailWrongPayment(
    metadataArray: D.Metadata[],
    paymentOption: string
  ) {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const utxo = randomArrayItem(await this.lucid.wallet.getUtxos());
    const amount = metadataArray.length;

    const { paymentUtxo, paymentTx } = await this.getPaymentTx(
      paymentOption,
      // - 1 to make it fail
      amount - 1
    );

    // --- 🔥 Continue minting NFTs ---
    const inputHash = await sha256(
      concat([await hashOutRef(utxo), await hashOutRef(paymentUtxo)])
    );

    const randomLane = hashToNumber(toHex(inputHash)) % 100;

    const [laneUtxo] = await asyncFilter(
      await this.lucid.utxosAtWithUnit(
        this.controlAddress,
        toUnit(this.controlPolicyId, fromText("Lane"))
      ),
      async (utxo) => {
        const datum = await this.lucid.datumOf(
          utxo,
          MintingPolicyMintingPolicySpend.datum
        );
        return (
          BigInt(randomLane) === datum.base / this.perLane &&
          datum.base + datum.counter + BigInt(amount) <= datum.maxId
        );
      }
    );

    if (!laneUtxo) {
      throw new Error("No NFT available");
    }

    const laneDatum = await this.lucid.datumOf<D.LaneDatum>(
      laneUtxo,
      D.LaneDatum
    );

    laneDatum.counter += BigInt(amount);

    const mintRedeemer = Data.to(
      {
        Minting: [
          { transactionId: utxo.txHash, outputIndex: BigInt(utxo.outputIndex) },
        ],
      },
      MintingPolicyMintingPolicySpend.action
    );

    let tx = this.lucid
      .newTx()
      .readFrom([paymentUtxo])
      .collectFrom([utxo])
      .collectFrom([laneUtxo], mintRedeemer)
      .mint(
        metadataArray.reduce((assets, metadata) => {
          const edition = parseEdition(metadata.name);
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 100)
          ] = 1n;
          assets[
            toUnit(this.policyId, this.baseName + fromNumber(edition), 222)
          ] = 1n;
          return assets;
        }, {} as Record<string, bigint>),
        Data.to("Mint", MintingPolicyMintingPolicyMint.action)
      )
      .payToContract(
        this.controlAddress,
        { Inline: Data.to<D.LaneDatum>(laneDatum, D.LaneDatum) },
        {
          [toUnit(this.controlPolicyId, fromText("Lane"))]: 1n,
        }
      );

    for (const metadata of metadataArray) {
      const edition = parseEdition(metadata.name);
      tx = tx.payToContract(
        this.metadataAddress,
        Data.to<D.MetadataDatum>(
          {
            metadata: Data.castFrom<D.Metadata222>(
              Data.fromMetadata(metadata),
              D.Metadata222
            ),
            version: 1n,
            extra: Data.from(Data.void()), // or any default you want
          },
          D.MetadataDatum
        ),
        {
          [toUnit(this.policyId, this.baseName + fromNumber(edition), 100)]: 1n,
        }
      );
    }

    const txHash = await tx
      .compose(paymentTx)
      .commit()
      .then((tx) => tx.sign().commit())
      .then((tx) => tx.submit());

    return {
      txHash,
      mintedIds: metadataArray.map((meta) => parseEdition(meta.name)),
    };
  }

  async failDestroyPaymentEarly() {
    await this.destroyPayment();
  }

  async failUpdatePaymentsWithoutOwnership(payments: D.PaymentInput[]) {
    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.paymentAddress,
      toUnit(this.controlPolicyId, fromText("Payment"))
    );

    // ✅ Convert PaymentInput[] to correct on-chain representation
    const paymentDatum: D.PaymentDatum[] = payments.map((p) => ({
      address: fromAddress(p.address),
      value: tokensToValue(p.tokens),
    }));

    await this.lucid
      .newTx()
      .collectFrom(
        [paymentUtxo],
        Data.to("Updating", PaymentControlPaymentControlSpend.action)
      )
      .payToContract(
        this.paymentAddress,
        {
          Inline: Data.to(paymentDatum, D.Payments), // ✅ correct type
          scriptRef: this.policy,
        },
        {
          [toUnit(this.controlPolicyId, fromText("Payment"))]: 1n,
        }
      )
      .attachScript(this.paymentValidator)
      .commit(); // ❌ This should fail because ownership is missing
  }
}
