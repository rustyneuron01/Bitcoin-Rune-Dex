import { getPendingBTCObjects, getPendingRuneObjets } from "./database.service";
import {
  generateSendPendingUsersPSBT,
  transferRuneToken,
  generateSendBTCPSBT,
  broadcastTapscriptPSBT,
} from "./psbt.service";
import {
  getBtcUtxoByAddress,
  finalizeTapscriptPsbtInput,
  getRuneUtxoByAddress,
} from "./psbt.utils";
import { type IArrayList } from "../types/types";
import { getBlockHeight, getFeeRate } from "./mempool";
import { splitUsers } from "./utils.service";
import { createMultiUserRune } from "./purchase.psbt.service";
import { ORDINAL_RECEIVE_VALUE } from "../config/config";
import txListModel from "../model/txListModel";
import { TxListStatus } from "../config/constant";
import distributeModel from "../model/distributeModel";

const ADMIN_PAYMENT_ADDRESS = process.env.ADMIN_PAYMENT_ADDRESS;

export const distributeToken = async () => {
  try {
    const latestBlock = await getBlockHeight();
    let block: any = await distributeModel.findOne().sort({ runeAmount: -1 });
    if (block == null || latestBlock > block?.latestBlock + 2) {
      const blockData = new distributeModel({
        latestBlock,
      });
      await blockData.save();
      let dummyDataVB,
        btcTxFee,
        totalDistributeBTCAmount = 0;
      const dummyUtxo = {
        txid: "4fded319be0622d6252eca4aa2d9892646a0d55db50b4bb5515bdcd55c7c8c2e",
        vout: 0,
        value: 1 * 10 ** 8,
      };
      const txFeeList: IArrayList[] = [];
      const feeRate = await getFeeRate();
      const { btcAddressList, totalBtcAmount } = await getPendingBTCObjects();
      const { pendingRuneArray, runeArrayList } = await getPendingRuneObjets();

      if (btcAddressList.length !== 0) {
        const btcPsbt = await generateSendPendingUsersPSBT(
          dummyUtxo.txid,
          dummyUtxo.vout,
          dummyUtxo.value,
          btcAddressList
        );

        dummyDataVB = await finalizeTapscriptPsbtInput(btcPsbt.toHex());
        btcTxFee = dummyDataVB.virtualSize() * feeRate;
        txFeeList.push({
          address: ADMIN_PAYMENT_ADDRESS as string,
          amount: btcTxFee + totalBtcAmount,
          id: "",
        });
        totalDistributeBTCAmount += btcTxFee + totalBtcAmount;
      }

      if (runeArrayList.length !== 0)
        for (const runeId of runeArrayList) {
          const runeBlock = runeId.split(":")[0];
          const runeTx = runeId.split(":")[1];
          const { runeUtxos, tokenSum } = await getRuneUtxoByAddress(
            ADMIN_PAYMENT_ADDRESS as string,
            runeBlock + ":" + runeTx
          );
          const userArray = await splitUsers(pendingRuneArray[runeId]);

          const splitRune = createMultiUserRune(
            BigInt(runeBlock),
            BigInt(runeTx),
            tokenSum,
            userArray.splitRuneInfo
          );

          const splitTxPsbt = await transferRuneToken(
            splitRune.buffer,
            userArray.splitRuneInfo,
            dummyUtxo,
            runeUtxos
          );
          dummyDataVB = await finalizeTapscriptPsbtInput(splitTxPsbt.toHex());
          btcTxFee = dummyDataVB.virtualSize() * feeRate;
          txFeeList.push({
            address: ADMIN_PAYMENT_ADDRESS as string,
            amount:
              btcTxFee + ORDINAL_RECEIVE_VALUE * userArray.splitRuneInfo.length,
            id: "",
          });
          totalDistributeBTCAmount +=
            btcTxFee + ORDINAL_RECEIVE_VALUE * userArray.splitRuneInfo.length;

          let voutCnt = 1;

          for (const eachUser of userArray.splitUserArray) {
            const rune = createMultiUserRune(
              BigInt(runeBlock),
              BigInt(runeTx),
              eachUser.tokenAmount,
              eachUser.users
            );

            const runeUtxo = {
              txid: "4fded319be0622d6252eca4aa2d9892646a0d55db50b4bb5515bdcd55c7c8c2e",
              vout: voutCnt,
              value: ORDINAL_RECEIVE_VALUE,
              amount: eachUser.tokenAmount,
            };

            const transferTxPsbt = await transferRuneToken(
              rune.buffer,
              eachUser.users,
              dummyUtxo,
              [runeUtxo]
            );
            dummyDataVB = await finalizeTapscriptPsbtInput(
              transferTxPsbt.toHex()
            );
            btcTxFee = dummyDataVB.virtualSize() * feeRate;
            txFeeList.push({
              address: ADMIN_PAYMENT_ADDRESS as string,
              amount: btcTxFee + ORDINAL_RECEIVE_VALUE * eachUser.users.length,
              id: "",
            });
            totalDistributeBTCAmount +=
              btcTxFee + ORDINAL_RECEIVE_VALUE * eachUser.users.length;

            voutCnt++;
          }
        }

      const btcUtxos = await getBtcUtxoByAddress(
        ADMIN_PAYMENT_ADDRESS as string
      );

      const sendBTCPsbt = await generateSendBTCPSBT(
        feeRate,
        btcUtxos,
        txFeeList,
        totalDistributeBTCAmount
      );
      //2eb3571d134def11f329b9bb84871fd39206e03fede25949fee47b2f143b212f
      const sendBTCTxId = await broadcastTapscriptPSBT(sendBTCPsbt.toHex());
      console.log("Distribute BTC TxID => ", sendBTCTxId);

      let sendBTCOutput = 0;

      if (btcAddressList.length !== 0) {
        const realBtcPsbt = await generateSendPendingUsersPSBT(
          sendBTCTxId,
          sendBTCOutput,
          txFeeList[sendBTCOutput].amount,
          btcAddressList
        );
        let sendTxId = await broadcastTapscriptPSBT(realBtcPsbt.toHex());
        console.log("Send Pending User BTC TxID => ", sendTxId);
        sendBTCOutput++;

        for (const item of btcAddressList) {
          await txListModel.findOneAndUpdate(
            {
              _id: item.id,
            },
            { status: TxListStatus.END }
          );
        }
        console.log("BTC Database Updated!!");
      }

      if (runeArrayList.length !== 0) {
        for (const runeId of runeArrayList) {
          const runeBlock = runeId.split(":")[0];
          const runeTx = runeId.split(":")[1];
          const { runeUtxos, tokenSum } = await getRuneUtxoByAddress(
            ADMIN_PAYMENT_ADDRESS as string,
            runeBlock + ":" + runeTx
          );
          const userArray = await splitUsers(pendingRuneArray[runeId]);

          const splitRune = createMultiUserRune(
            BigInt(runeBlock),
            BigInt(runeTx),
            tokenSum,
            userArray.splitRuneInfo
          );

          const splitTxPsbt = await transferRuneToken(
            splitRune.buffer,
            userArray.splitRuneInfo,
            {
              txid: sendBTCTxId,
              vout: sendBTCOutput,
              value: txFeeList[sendBTCOutput].amount,
            },
            runeUtxos
          );
          const splitRuneTxId = await broadcastTapscriptPSBT(
            splitTxPsbt.toHex()
          );
          console.log("Send Pending User Split Rune TxID => ", splitRuneTxId);
          sendBTCOutput++;

          let voutCnt = 1;
          for (const eachUser of userArray.splitUserArray) {
            const rune = createMultiUserRune(
              BigInt(runeBlock),
              BigInt(runeTx),
              eachUser.tokenAmount,
              eachUser.users
            );

            const runeUtxo = {
              txid: splitRuneTxId,
              vout: voutCnt,
              value: ORDINAL_RECEIVE_VALUE,
              amount: eachUser.tokenAmount,
            };

            const transferTxPsbt = await transferRuneToken(
              rune.buffer,
              eachUser.users,
              {
                txid: sendBTCTxId,
                vout: sendBTCOutput,
                value: txFeeList[sendBTCOutput].amount,
              },
              [runeUtxo]
            );

            const sendRuneToUserTxId = await broadcastTapscriptPSBT(
              transferTxPsbt.toHex()
            );
            console.log("Send Pending User Rune TxID => ", sendRuneToUserTxId);

            voutCnt++;
            sendBTCOutput++;
          }

          for (const item of pendingRuneArray[runeId]) {
            await txListModel.findOneAndUpdate(
              {
                _id: item.id,
              },
              { status: TxListStatus.END }
            );
          }

          console.log(`${pendingRuneArray[runeId]} Rune Token DB Updated`);
        }
      }
    }
  } catch (error) {}
};
