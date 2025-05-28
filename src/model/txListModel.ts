import { default as mongoose, Schema } from "mongoose";

const TxListSchema = new Schema(
  {
    txId: { type: String, default: "" },
    receiveAddress: { type: String, require: true },
    runeName: { type: String, require: true },
    psbt: { type: String, default: "" },
    signedPSBT: { type: String, default: "" },
    runeId: { type: String, require: true },
    type: { type: Number, require: true },              // 0: Rune, 1: BTC
    btcAmount: { type: Number, default: 0 },
    runeAmount: { type: Number, default: 0 },
    status: { type: Number, default: 0 },               // 0: Tx Requested, 1 : Tx Created, 2: Tx Completed, 3: Send Token
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("TxListSchema", TxListSchema);
