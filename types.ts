import { Data } from "../deps.ts";

export const Credential = Data.Enum(
  {
    VerificationKey: [Data.Bytes(28)],
  },
  {
    Script: [Data.Bytes(28)],
  }
);
export type Credential = typeof Credential;

export const Address = Data.Object({
  paymentCredential: Credential,
  stakeCredential: Data.Nullable(
    Data.Enum(
      { Inline: [Credential] },
      {
        Pointer: {
          slotNumber: Data.Integer(),
          transactionIndex: Data.Integer(),
          certificateIndex: Data.Integer(),
        },
      }
    )
  ),
});
export type Address = typeof Address;

export const OutRef = Data.Object({
  transactionId: Data.Object({
    hash: Data.Bytes(),
  }),
  outputIndex: Data.Integer(),
});
export type OutRef = typeof OutRef;

export const ThreadPolicyParams = Data.Tuple([OutRef]);
export type ThreadPolicyParams = typeof ThreadPolicyParams;

export const MetadataControlParams = Data.Tuple([
  Data.Bytes({ minLength: 28, maxLength: 28 }),
]);
export type MetadataControlParams = typeof MetadataControlParams;

export const ThreadParams = Data.Tuple([
  Data.Bytes({ minLength: 28, maxLength: 28 }),
  Address,
]);
export type ThreadParams = typeof ThreadParams;

export const PaymentAction = Data.Enum("Minting", "Burning");
export type PaymentAction = typeof PaymentAction;
export const ControlAction = Data.Enum("Initialize", "ShutDown");
export type ControlAction = typeof ControlAction;
export const PolicyAction = Data.Enum("Mint", "Burn");
export type PolicyAction = typeof PolicyAction;

export const MutationAction = Data.Enum("BurnNft", "AppMutation");
export type MutationAction = typeof MutationAction;

export const LaneDatum = Data.Object({
  base: Data.Integer(),
  counter: Data.Integer(),
  maxId: Data.Integer(),
});
export type LaneDatum = typeof LaneDatum;

export const MintAction = Data.Enum("Destroy", {
  Progress: [OutRef],
});
export type MintAction = typeof MintAction;

// 👇 NEW: Asset definition
// export const Token = Data.Object({
//   policy_id: Data.Nullable(Data.Bytes()),
//   token_name: Data.Nullable(Data.Bytes()),
//   amount: Data.Integer(),
// });
// export type Token = typeof Token;

// 👇 UPDATED: Payments definition
// export const Payments = Data.Array(
//   Data.Object({
//     address: Address,
//     tokens: Data.Array(Token),
//   })
// );
// export type Payments = typeof Payments;

// export type PaymentDatum = {
//   address: Address;
//   value: Value;
// };

// export type Payments = PaymentDatum[];

type FileDetails = {
  name?: string;
  mediaType: string;
  src: string;
};

export type Metadata = {
  name: string;
  image: string;
  mediaType?: string;
  description?: string;
  files?: FileDetails[];
};
export type AppMetadataJson = {
  attitude: number;
  efficiency: number;
};

export type PaymentToken = {
  policy_id: string | null;
  token_name: string | null;
  amount: bigint;
};

export type PaymentInput = {
  address: string;
  tokens: PaymentToken[];
};

export const Metadata222 = Data.Map(Data.Bytes(), Data.Any());
export type Metadata222 = typeof Metadata222;

export const MetadataDatum = Data.Object({
  metadata: Metadata222,
  version: Data.Integer(),
  extra: Data.Any(),
});
export type MetadataDatum = typeof MetadataDatum;

export const Value = Data.Map(
  Data.Bytes(),
  Data.Map(Data.Bytes(), Data.Integer())
);

export type Value = typeof Value;

export const PaymentDatum = Data.Object({
  address: Address,
  value: Value,
});
export type PaymentDatum = typeof PaymentDatum;

export const Payments = Data.Array(PaymentDatum);
export type Payments = typeof Payments;
