use cardano/address.{Address}
use cardano/assets.{Value}
use cardano/transaction.{OutputReference}

pub type LaneAction {
  Minting(OutputReference)
  DestroyLanes
}

pub type MintAction {
  Mint
  Burn
}

pub type LaneDatum {
  base: Int,
  counter: Int,
  maxId: Int,
}


pub type ControlAction {
  Initialize     
  Shutdown    
}

pub type MetadataAction {
  BurnNft
  AppMutation
}

pub type Metadata222 = Pairs<String, Data>

pub type MetadataDatum {
  metadata: Metadata222,
  version: Int,
  extra: Data,
}

pub type Payment {
  address: Address,
  value: Value
}

pub type Payments = List<Payment>

pub type PaymentAction {
  Updating
  Burning
}