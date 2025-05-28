import { type Request, type Response } from "express";
import etchingRuneModel from "../model/etchingRuneModel";
import { getRuneToken } from "../service/database.service";
import { calcTokenBalance } from "../service/utils.service";

export const fetchAllRuneToken = async (req: Request, res: Response) => {
  try {
    const allRunes = await etchingRuneModel.find({ status: 2 });
    const runeList = [];
    for (const eachRune of allRunes) {
      const remainAmount = await getRuneToken(eachRune);
      const tokenBalance = await calcTokenBalance(
        remainAmount,
        eachRune.runeAmount * eachRune.initialPrice
      );
      const newRune = {
        name: eachRune.runeName,
        symbol: eachRune.runeSymbol,
        remainAmount: remainAmount / 10 ** eachRune.divisibility,
        tokenBalance: tokenBalance,
        runeId: eachRune.runeId,
      };
      runeList.push(newRune);
    }
    return res.status(200).json({ runeList });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, msg: "Error While Fetching Rune Tokens" });
  }
};

export const updateRuneValue = async (req: Request, res: Response) => {
  try {
    const { runeName, runeAmount, action } = req.body;
    const filterRune: any = await etchingRuneModel.findOne({
      runeName: {
        $regex: runeName.toLocaleLowerCase(),
        $options: "i",
      },
    });
    const flg = action == 0 ? -1 : 1;
    const remainAmount = await getRuneToken(filterRune);
    const tokenBalance = await calcTokenBalance(
      remainAmount + flg * runeAmount * 10 ** filterRune.divisibility,
      filterRune.runeAmount * filterRune.initialPrice
    );
    return res.status(200).json({ tokenBalance });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, msg: "Error While Calc Rune Balance" });
  }
};
