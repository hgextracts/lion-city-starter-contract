use aiken/collection/list
use aiken/primitive/bytearray
use cardano/assets.{PolicyId, flatten, quantity_of, without_lovelace}
use cardano/transaction.{OutputReference, Transaction}
use constants
use types.{MetadataAction, AppMutation, BurnNft}
use utils.{get_self_input}

validator metadata_validator(control_policy_id: PolicyId) {
  spend(
    _datum: Option<Data>,
    action: MetadataAction,
    utxo: OutputReference,
    tx: Transaction,
  ) {
    let self_input = get_self_input(utxo, tx)

    when action is {

      // 🔥 Burn: destroy both the reference and user token (CIP-68 pair)
      BurnNft -> {
        expect [
          (ref_policy_id, ref_name, ref_quantity),
          (user_policy_id, user_name, user_quantity),
        ] = flatten(tx.mint)

        expect [(self_policy_id, self_name, _)] =
          flatten(without_lovelace(self_input.output.value))

        and {
          user_policy_id == self_policy_id,
          ref_policy_id == self_policy_id,
          bytearray.take(ref_name, constants.label_length) == constants.label100,
          bytearray.take(user_name, constants.label_length) == constants.label222,
          bytearray.drop(ref_name, constants.label_length) == bytearray.drop(user_name, constants.label_length),
          ref_name == self_name,
          user_quantity == -1,
          ref_quantity == -1,
        }
      }

      // 🛠️ AppMutation: update metadata with trusted authority
      AppMutation -> {
        let has_appwallet_token =
          list.any(
            tx.inputs,
            fn(input) {
              quantity_of(input.output.value, control_policy_id, constants.app_wallet) >= 1
            }
          )

        expect has_appwallet_token

        // Ensure updated datum goes to same address with same token(s)
        expect Some(new_output) =
          list.find(
            tx.outputs,
            fn(output) { output.address == self_input.output.address },
          )

        let old_value = flatten(without_lovelace(self_input.output.value))
        let new_value = flatten(without_lovelace(new_output.value))

        old_value == new_value
      }
    }
  }

  else(_) {
    fail
  }
}
