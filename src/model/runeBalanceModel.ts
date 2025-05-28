import { default as mongoose, Schema } from "mongoose";

const RuneBalanceSchema = new Schema(
  {
    userId: { type: String, require: true },
    runeId: { type: String, require: true },
    balance: { type: Number, default: 0 },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("RuneBalanceSchema", RuneBalanceSchema);
