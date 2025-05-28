import axios from "axios";
import {
  ADMIN_PAYMENT_ADDRESS,
  OPENAPI_UNISAT_TOKEN,
  OPENAPI_UNISAT_URL,
  ORDINAL_RECEIVE_VALUE,
} from "../config/config";
import { DepositTxStatus, TxListStatus, TxStatus } from "../config/constant";
import depositModel from "../model/depositModel";
import etchingRuneModel from "../model/etchingRuneModel";
import userModel from "../model/userModel";
import { getBlockHeight, getTxStatus } from "../service/mempool";
import { broadcastPSBT, inscribeImagePSBT } from "../service/psbt.service";
import txListModel from "../model/txListModel";
import withdrawModel from "../model/withdrawModel";
import {
  generateBTCSendPsbt,
  generateRuneSendPsbt,
} from "../service/purchase.psbt.service";
import { getBtcUtxoByAddress, waitUntilUTXO } from "../service/psbt.utils";
import pumpActionModel from "../model/pumpActionModel";
import runeBalanceModel from "../model/runeBalanceModel";
import waitEtchingModel from "../model/waitEtchingModel";
import { sendBTC } from "../service/unisat.service";
import { delay } from "../service/utils.service";
import { etchingRuneToken, wallet } from "../controller/etchingController";

export const checkDepositTxStatus = async () => {
  try {
    console.log("= = = Pending Deposits = = =");
    let _cnt = 0;
    // const currentBlockHeight = await getBlockHeight();

    const pendingDeposits: any[] = await depositModel.find({
      status: DepositTxStatus.PENDING,
    });
    // const pendingDepositList = await Promise.all(
    //   pendingDeposits.map((depositlist) => getTxStatus(depositlist.txId))
    // );
    // console.log(pendingDeposits);

    for (const pendingDeposit of pendingDeposits) {
      try {
        const txStatus = await getTxStatus(pendingDeposit.txId);
        if (txStatus.confirmed) {
          await depositModel.updateOne(
            { depositId: pendingDeposit.depositId },
            {
              status: DepositTxStatus.READY,
            }
          );

          const userData: any = await userModel.findOne({
            userId: pendingDeposit.userId,
          });
          const btcBalance = userData.btcBalance + pendingDeposit.amount;
          await userModel
            .updateOne({ userId: pendingDeposit.userId }, { btcBalance })
            .exec();
        }
        _cnt++;
      } catch (error) {
        console.log("error :>> ", error);
        _cnt++;
      }
    }

    // _cnt = 0;

    // const pendingDeposits1 = await depositModel.find({
    //   status: TxStatus.READY,
    // });
    // const pendingDepositList1 = await Promise.all(
    //   pendingDeposits1.map((depositlist) => getTxStatus(depositlist.txId))
    // );

    // for (const pendingDeposit of pendingDepositList1) {
    //   if (pendingDeposit.confirmed) {
    //     await depositModel.findOneAndUpdate(
    //       {
    //         txId: pendingDeposits1[_cnt].txId,
    //       },
    //       {
    //         status: TxStatus.END,
    //       }
    //     );
    //   }
    //   _cnt++;
    // }

    return;
  } catch (error) {
    console.log("Check All Deposit Tx Error : ", error);
    return false;
  }
};

export const checkBuyRuneTxStatus = async () => {
  const pendingBuyTxs = await pumpActionModel.find({
    type: 0,
    txId: { $ne: "" },
    status: 0,
  });
  console.log("pendingBuyTxs :>> ", pendingBuyTxs);
  for (let i = 0; i < pendingBuyTxs.length; i++) {
    const { pumpActionId, userId, btcAmount, runeId, runeAmount, txId } =
      pendingBuyTxs[i];
    const txStatus = await getTxStatus(txId);
    if (txStatus.confirmed) {
      const userDocument: any = await userModel.findOne({ userId });
      await userModel.findOneAndUpdate(
        { userId },
        {
          btcBalance: userDocument.btcBalance - btcAmount,
        }
      );
      const rune: any = await etchingRuneModel.findOne({ runeId });
      await etchingRuneModel.findOneAndUpdate(
        {
          runeId,
        },
        {
          remainAmount: rune.remainAmount - runeAmount,
        }
      );
      const runeBalanceInfo: any = await runeBalanceModel.findOne({
        userId,
        runeId,
      });
      await runeBalanceModel.findOneAndUpdate(
        { userId, runeId },
        {
          balance: runeBalanceInfo.balance + runeAmount,
        }
      );
      await pumpActionModel.updateOne(
        { pumpActionId },
        { $set: { status: 1 } }
      );
    }
  }
};

export const checkWithdrawBtcs = async () => {
  const pendingwithdraws = await withdrawModel.find({
    status: 0,
  });
  for (let i = 0; i < pendingwithdraws.length; i++) {
    const { withdrawId, txId } = pendingwithdraws[i];
    const txStatus = await getTxStatus(txId);
    if (txStatus.confirmed) {
      await pumpActionModel.updateOne({ withdrawId }, { $set: { status: 1 } });
    }
  }
};

export const checkTxStatus = async () => {
  try {
    let _cnt = 0;
    const currentBlockHeight = await getBlockHeight();

    const ruenEtchingList = await etchingRuneModel.find({
      status: TxStatus.PENDING,
    });
    const checkRuneEtchingList = await Promise.all(
      ruenEtchingList.map((etchinglist) => getTxStatus(etchinglist.sendBTCTxId))
    );

    for (const checkRuneEtching of checkRuneEtchingList) {
      if (
        checkRuneEtching.confirmed &&
        currentBlockHeight >= checkRuneEtching.blockHeight + 5
      ) {
        const txId = await broadcastPSBT(ruenEtchingList[_cnt].psbt);
        await etchingRuneModel.findOneAndUpdate(
          {
            sendBTCTxId: ruenEtchingList[_cnt].sendBTCTxId,
          },
          {
            status: TxStatus.READY,
            txId: txId,
          }
        );
      }
      _cnt++;
    }

    _cnt = 0;

    const ruenEtchingList1 = await etchingRuneModel.find({
      status: TxStatus.READY,
    });
    const checkRuneEtchingList1 = await Promise.all(
      ruenEtchingList1.map((etchinglist) => getTxStatus(etchinglist.txId))
    );

    for (const checkRuneEtching1 of checkRuneEtchingList1) {
      if (checkRuneEtching1.confirmed) {
        const url = `${OPENAPI_UNISAT_URL}/v1/indexer/runes/utxo/${ruenEtchingList1[_cnt].txId}/1/balance`;
        console.log("url :>> ", url);
        const config = {
          headers: {
            Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
          },
        };
        const res = await axios.get(url, config);
        console.log("res.data :>> ", res.data);

        await etchingRuneModel.findOneAndUpdate(
          {
            txId: ruenEtchingList1[_cnt].txId,
          },
          {
            status: TxStatus.END,
            runeId: res.data.data[0].runeid,
          }
        );
      }
      _cnt++;
    }

    return;
  } catch (error) {
    console.log("Check All Etching Tx Status : ", error);
    return false;
  }
};

export const checkTxListStatus = async () => {
  try {
    let _cnt = 0;
    let completedArray: Record<string, number> = {};
    const runeIdList: string[] = [];
    const txList: any = await txListModel.find({
      status: TxListStatus.PENDING,
    });
    const checkTxList = await Promise.all(
      txList.map((eachItem: any) => getTxStatus(eachItem.txId))
    );
    for (const eachItem of checkTxList) {
      if (eachItem.confirmed) {
        let runeName = txList[_cnt].runeName;
        if (!completedArray[runeName]) {
          completedArray[runeName] = 0;
          runeIdList.push(runeName);
        }

        if (txList[_cnt].type === 0)
          completedArray[runeName] -= txList[_cnt].runeAmount;
        else completedArray[runeName] += txList[_cnt].runeAmount;

        await txListModel.findOneAndUpdate(
          {
            _id: txList[_cnt].id,
          },
          { status: TxListStatus.COMPLETED }
        );
      }
      _cnt++;
    }

    for (const item of runeIdList) {
      const filterItem = await etchingRuneModel.findOne({
        runeName: { $regex: item.toLocaleLowerCase(), $options: "i" },
      });
      if (filterItem) {
        filterItem.remainAmount += completedArray[item];
        await filterItem.save();
      }
    }
  } catch (error) {
    console.log(error);
  }
  return;
};

export const checkEtchingTxStatus = async () => {
  const waitTxs = await waitEtchingModel.find({
    status: 0,
  });

  for (let i = 0; i < waitTxs.length; i++) {
    const {
      waitEtchingId,
      userId,
      runeName,
      runeSymbol,
      status,
      txId,
      calcTxFee,
      fee,
      address,
      ordinal_p2tr,
      redeem,
    } = waitTxs[i];
    const userDocument: any = await userModel.findOne({ userId });
    if (!userDocument) continue;
    const txStatus = await getTxStatus(txId);
    if (txStatus.confirmed) {
      await userModel.updateOne(
        { userId },
        { btcBalance: userDocument.btcBalance - fee }
      );

      await sendBTC(calcTxFee + ORDINAL_RECEIVE_VALUE, address);

      await delay(5000);

      const utxos = await waitUntilUTXO(address);
      const utxo = utxos.filter(
        (utxo) => utxo.value === calcTxFee + ORDINAL_RECEIVE_VALUE
      );

      const generateImagePsbt = await inscribeImagePSBT(
        utxo,
        ordinal_p2tr,
        redeem,
        wallet.address
      );

      const imageEtchingTxId = await broadcastPSBT(generateImagePsbt.toHex());

      if (!imageEtchingTxId) continue;

      console.log("Image Etching Tx ID => ", imageEtchingTxId);

      const runeAmount = 1000000;
      const initialPrice = `1000000`;

      await etchingRuneToken(
        runeName,
        runeAmount,
        runeSymbol,
        imageEtchingTxId,
        initialPrice,
        userDocument.paymentAddress
      );

      await waitEtchingModel.updateOne(
        {
          waitEtchingId,
        },
        {
          $set: {
            status: 1,
          },
        }
      );
    }
  }
};
