import * as Bitcoin from "bitcoinjs-lib";
import { wallet } from "../controller/etchingController";

export const acceptMultisigSignPsbt = async (ppsbt: string) => {
  const tempPsbt = Bitcoin.Psbt.fromHex(ppsbt);
  const inputCount = tempPsbt.inputCount;
  const inputArray = Array.from({ length: inputCount }, (_, i) => i);
  const toSignInputs: { index: number; publicKey: string }[] = [];
  inputArray.map((value: number) =>
    toSignInputs.push({
      index: value,
      publicKey: wallet.pubkey,
    })
  );
  console.log("toSignInputs ==> ", toSignInputs);
  const ops = {
    autoFinalized: false,
    inputs: toSignInputs,
  };
  return await wallet.signPsbt(tempPsbt, ops);
};
