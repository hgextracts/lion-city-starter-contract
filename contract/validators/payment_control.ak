use aiken/collection/list
use cardano/transaction.{Transaction, OutputReference, Input}
use cardano/assets.{PolicyId, without_lovelace, zero, add, quantity_of}
use types.{PaymentAction, Updating, Burning}
use constants
use utils.{get_self_input}


validator payment_control(control_policy_id: PolicyId) {

  //----------------------------------------
  // Spend Validator
  //----------------------------------------
  spend(_datum: Option<Data>, action: PaymentAction, utxo: OutputReference, tx: Transaction) -> Bool {

    when action is {

      //----------------------------------------
      // Updating Payment Options
      //----------------------------------------
      Updating -> {
        let self_input = get_self_input(utxo, tx)

        // 1. Must find Ownership token inside inputs
        let has_ownership_token = list.any(
          tx.inputs,
          fn(input) {
            quantity_of(input.output.value, control_policy_id, constants.ownership) >= 1
          }
        )

        // 2. Must return Payment UTxO to same address
        let same_address_output = list.any(
          tx.outputs,
          fn(output) {
            output.address == self_input.output.address
          }
        )

        has_ownership_token && same_address_output
      }

      //----------------------------------------
      // Burning Payment Datum (destroy)
      //----------------------------------------
      Burning -> {
        zero
        |> add(control_policy_id, constants.payment, -1)
        |> add(control_policy_id, constants.ownership, -1)
        |> fn(expected_burn) {
          without_lovelace(tx.mint) == expected_burn
        }
      }
    }
  }
}