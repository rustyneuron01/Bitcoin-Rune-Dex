import etchingRuneModel from "../model/etchingRuneModel";
import type { EtchingRuneTypes } from "../propTypes";

export const calcRunePrice = async (
  runeId: string,
  btcAmount: string,
  type: Number
) => {
  const rune: EtchingRuneTypes | any = await etchingRuneModel.findOne({
    runeId,
  });
  if (rune) {
    const k = rune.runeAmount * rune.initialPrice;
    const _btcAmount = Number(btcAmount);
    if (type == 0) {
      const calc = k / (rune.remainAmount - _btcAmount);
      return calc;
    } else {
      const calc = k / (rune.remainAmount + _btcAmount);
      return calc;
    }
  } else {
    return 0;
  }
};
