use aiken/collection/dict
use aiken/collection/list
use cardano/transaction.{
  Datum, DatumHash, InlineDatum, Input, NoDatum, OutputReference, Transaction,
}

/// 🔍 Returns the input that matches the given output reference.
/// Used to find the UTXO this script is currently spending.
pub fn get_self_input(utxo: OutputReference, tx: Transaction) -> Input {
  expect Some(input) =
    list.find(tx.inputs, fn(i) { i.output_reference == utxo })
  input
}

/// 🔍 Retrieves datum content from either inline or hash reference.
/// Fails if datum is missing or hash not found in tx datums.
pub fn get_data(tx: Transaction, datum: Datum) -> Data {
  when datum is {
    InlineDatum(d) -> d
    DatumHash(h) -> {
      expect Some(d) = dict.get(tx.datums, h)
      d
    }
    NoDatum -> fail
  }
}
