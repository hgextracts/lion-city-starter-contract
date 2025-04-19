use aiken/collection/list
use cardano/transaction.{Transaction, OutputReference}
use cardano/assets.{PolicyId, flatten}
use types.{ControlAction, Initialize, Shutdown}

/// The control policy governs minting/burning of:
/// - Lane tokens (used for concurrency control)
/// - Payment token (configures mint cost)
/// - Ownership token (enables admin operations)
/// - AppWallet token (optional on-chain authority)

validator control_policy(starter_utxo: OutputReference) {

  /// Minting logic for the control policy
  mint(action: ControlAction, policy_id: PolicyId, tx: Transaction) -> Bool {
    when action is {

      //----------------------------------------
      // 🔧 Initialize:
      // - Mints lanes + system tokens
      // - Requires spending control UTXO as authorization
      //----------------------------------------
      Initialize -> {
        list.any(
          tx.inputs,
          fn(input) { input.output_reference == starter_utxo }
        )
      }

      //----------------------------------------
      // 🧨 Shutdown:
      // - Allows burning of Lane, Payment and Ownership tokens
      //----------------------------------------
      Shutdown -> {
        list.all(
          flatten(tx.mint),
          fn((pid, _aname, qty)) {
            pid != policy_id || qty < 0
          }
        )
      }
    }
  }
  else(_) {
    fail
  }
}
