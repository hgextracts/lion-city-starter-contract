use aiken/collection/list
use cardano/address.{Address, Script}
use cardano/assets.{PolicyId,
  flatten, from_asset, quantity_of, without_lovelace}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use constants
use types.{
  Burn, DestroyLanes, LaneAction, LaneDatum, Mint, MintAction, Minting, Payment,
  Payments,
}
use utils.{get_self_input, token_paid}

validator minting_policy(
  control_policy_id: PolicyId,
  metadata_address: Address,
) {
  // ------------------------------------------------------------
  // 🔹 Mint Validator: Controls minting and burning behavior
  // ------------------------------------------------------------
  mint(action: MintAction, policy_id: PolicyId, tx: Transaction) {
    when action is {
      // ✅ Mint: Ensure that a valid Lane token UTXO is present in inputs
      Mint ->
        list.any(
          tx.inputs,
          fn(input) {
            when input.output.address.payment_credential is {
              Script(script_hash) ->
                script_hash == policy_id && quantity_of(
                  input.output.value,
                  control_policy_id,
                  constants.lane,
                ) >= 1
              _ -> False
            }
          },
        )

      // ✅ Burn: Ensure only assets under this policy are burned (negative quantity)
      Burn ->
        list.all(
          flatten(tx.mint),
          fn((pid, _name, qty)) { pid != policy_id || qty < 0 },
        )
    }
  }

  // ------------------------------------------------------------
  // 🔹 Spend Validator: Handles minting progression or destruction of lanes
  // ------------------------------------------------------------
  spend(
    datum: Option<LaneDatum>,
    action: LaneAction,
    utxo: OutputReference,
    tx: Transaction,
  ) {
    expect Some(lane_datum) = datum

    when action is {
      // ✅ Minting: Validate mint flow including randomness, payment, metadata delivery, and lane state
      Minting(user_input_ref) -> {
        let self_input = get_self_input(utxo, tx)

        // 1️⃣ Must include the user-selected randomness input (e.g. wallet UTXO)
        expect Some(_) =
          list.find(tx.inputs, fn(i) { i.output_reference == user_input_ref })

        // 2️⃣ Must include the correct Payment reference input
        expect Some(payment_input) =
          list.find(
            tx.reference_inputs,
            fn(i) {
              quantity_of(i.output.value, control_policy_id, constants.payment) >= 1
            },
          )

        // 3️⃣ Parse Payments datum from the reference input
        expect payments: Payments = {
          expect InlineDatum(d) = payment_input.output.datum
          d
        }

        // 4️⃣ Validate minted assets structure and count
        expect Script(policy_hash) =
          self_input.output.address.payment_credential

        let minted_assets = flatten(tx.mint)
        let minted_count = list.length(minted_assets) / 2

        // 100 + 222 = 2 per edition
        let correct_policy =
          list.all(minted_assets, fn((pid, _name, _)) { pid == policy_hash })

        let correct_qty = list.all(minted_assets, fn((_, _, qty)) { qty == 1 })

        // 5️⃣ Validate payment went to correct recipient with correct amount
        let valid_payment =
          list.all(
            payments,
            fn(payment) {
              let outputs_to_address =
                list.filter(
                  tx.outputs,
                  fn(output) { output.address == payment.address },
                )

              let total_value =
                list.foldr(
                  outputs_to_address,
                  assets.zero,
                  fn(output, acc) { assets.merge(acc, output.value) },
                )

              token_paid(total_value, payment.value, minted_count)
            },
          )

        // 6️⃣ Lane UTXO must be correctly updated
        let lane_output = {
          expect [lane_output] =
            list.filter(
              tx.outputs,
              fn(output) {
                when output.address.payment_credential is {
                  Script(script_hash) -> script_hash == policy_hash
                  _ -> False
                }
              },
            )
          lane_output
        }

        // ✅ Validate lane value and datum update
        let lane_value = flatten(without_lovelace(lane_output.value))
        expect new_lane_datum: LaneDatum = {
          expect InlineDatum(d) = lane_output.datum
          d
        }

        let valid_lane = and {
            new_lane_datum.counter > lane_datum.counter,
            new_lane_datum.counter <= lane_datum.maxId,
            new_lane_datum.base == lane_datum.base,
            new_lane_datum.maxId == lane_datum.maxId,
            lane_value == flatten(
              from_asset(control_policy_id, constants.lane, 1),
            ),
          }

        // 7️⃣ Ensure at least one output sends token to the metadata script address
        let valid_100_output =
          list.any(
            tx.outputs,
            fn(output) { output.address == metadata_address },
          )

        // ✅ Final minting check
        and {
          correct_policy,
          correct_qty,
          valid_payment,
          valid_lane,
          valid_100_output,
        }
      }

      // ✅ DestroyLanes: Burn all remaining Lane tokens if owner and payment are present
      DestroyLanes ->
        quantity_of(tx.mint, control_policy_id, constants.lane) < 0 && list.any(
          tx.inputs,
          fn(input) {
            quantity_of(
              input.output.value,
              control_policy_id,
              constants.ownership,
            ) >= 1
          },
        ) && list.all(
          tx.outputs,
          fn(output) {
            quantity_of(output.value, control_policy_id, constants.lane) == 0
          },
        )
    }
  }

  // ------------------------------------------------------------
  // 🔒 Catch-all fallback — reject any other redeemer
  // ------------------------------------------------------------
  else(_) {
    fail
  }
}
