import {
  Addresses,
  Assets,
  Data,
  fromHex,
  fromText,
  Lucid,
  OutRef,
  sha256,
} from "./deps.ts";
import * as D from "./types.ts";
import { PaymentToken } from "./types.ts";

export function tokensToValue(tokens: PaymentToken[]): D.Value {
  const value = new Map<string, Map<string, bigint>>();

  for (const token of tokens) {
    const policyId = token.policy_id ?? "";
    const tokenName = token.token_name ?? "";

    if (!value.has(policyId)) {
      value.set(policyId, new Map());
    }

    value.get(policyId)!.set(tokenName, token.amount);
  }

  return value;
}

export function fromAddress(address: string): D.Address {
  const { payment, delegation } = Addresses.inspect(address);

  if (!payment) throw new Error("Not a valid payment address.");

  return {
    paymentCredential:
      payment?.type === "Key"
        ? {
            VerificationKey: [payment.hash],
          }
        : { Script: [payment.hash] },
    stakeCredential: delegation
      ? {
          Inline: [
            delegation.type === "Key"
              ? { VerificationKey: [delegation.hash] }
              : { Script: [delegation.hash] },
          ],
        }
      : null,
  };
}

export function toAddress(address: D.Address, lucid: Lucid): string {
  const paymentCredential = (() => {
    if ("VerificationKey" in address.paymentCredential) {
      return Addresses.keyHashToCredential(
        address.paymentCredential.VerificationKey[0]
      );
    } else {
      return Addresses.scriptHashToCredential(
        address.paymentCredential.Script[0]
      );
    }
  })();
  const stakeCredential = (() => {
    if (!address.stakeCredential) return undefined;
    if ("Inline" in address.stakeCredential) {
      if ("VerificationKey" in address.stakeCredential.Inline[0]) {
        return Addresses.keyHashToCredential(
          address.stakeCredential.Inline[0].VerificationKey[0]
        );
      } else {
        return Addresses.scriptHashToCredential(
          address.stakeCredential.Inline[0].Script[0]
        );
      }
    } else {
      return undefined;
    }
  })();
  return lucid.utils.credentialToAddress(paymentCredential, stakeCredential);
}

export function fromAssets(assets: Assets): D.Value {
  const value = new Map() as D.Value;
  if (assets.lovelace) value.set("", new Map([["", assets.lovelace]]));

  const units = Object.keys(assets);
  const policies = Array.from(
    new Set(
      units
        .filter((unit) => unit !== "lovelace")
        .map((unit) => unit.slice(0, 56))
    )
  );
  policies.sort().forEach((policyId) => {
    const policyUnits = units.filter((unit) => unit.slice(0, 56) === policyId);
    const assetsMap = new Map<string, bigint>();
    policyUnits.sort().forEach((unit) => {
      assetsMap.set(unit.slice(56), assets[unit]);
    });
    value.set(policyId, assetsMap);
  });
  return value;
}

export function toAssets(value: D.Value): Assets {
  const result: Assets = { lovelace: value.get("")?.get("") || 0n };

  for (const [policyId, assets] of value) {
    if (policyId === "") continue;
    for (const [assetName, amount] of assets) {
      result[policyId + assetName] = amount;
    }
  }
  return result;
}

export function checkVariableFee(fee: number): bigint {
  if (fee <= 0) throw new Error("Variable fee needs to be greater than 0.");
  return BigInt(Math.floor(1 / (fee / 10)));
}

export function fromNumber(n: number | bigint): string {
  return fromText(n.toString());
}

export function instanceIdToStruct(
  instanceId: string
): OutRef & { baseName: string; perLane: number } {
  const [txHash, outputIndex, baseName, perLane] = instanceId.split("-");
  return {
    txHash,
    outputIndex: parseInt(outputIndex),
    baseName,
    perLane: parseInt(perLane),
  };
}

export async function asyncFilter<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => unknown
) {
  return await Promise.all(array.map(predicate)).then((results) =>
    array.filter((_, index) => results[index])
  );
}

export async function hashOutRef(outRef: OutRef): Promise<Uint8Array> {
  return await sha256(
    fromHex(
      Data.to<D.OutRef>(
        {
          transactionId: { hash: outRef.txHash },
          outputIndex: BigInt(outRef.outputIndex),
        },
        D.OutRef
      )
    )
  );
}

export function hashToNumber(hash: string): number {
  return parseInt(hash.slice(0, 12), 16);
}

export function randomArrayItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export const instanceMissingError = new Error(
  "Contract needs to be initialized with an instance id."
);

export const instanceAlreadyDeployedError = new Error(
  "Contract is already deployed."
);

export function parseEdition(name: string): number {
  return parseInt(name.replace(/\D/g, ""), 10);
}
