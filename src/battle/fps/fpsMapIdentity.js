// 呈現名稱唯一來源；legacy key 留作既有賽事、名單與存檔的相容識別。
export const FPS_MAJOR_MAP_ART = Object.freeze({
  mirage: { name: "澄灣水務", style: "海岸水務設施與石造機房", shell: 0xd5c6ab, trim: 0x688d8b, roof: 0x435e60, paving: 0x737e77, tile: 0, landmark: "蓄水塔", zones: ["調壓站", "濾水庭院", "檢修中庭"] },
  dust2: { name: "潮汐貨港", style: "貨運倉庫、冷鏈碼頭與維修庫", shell: 0xb2c3bf, trim: 0x436f79, roof: 0x344a52, paving: 0x66777b, tile: 1, landmark: "吊運架", zones: ["冷鏈裝卸場", "維修庫", "海關通道"] },
  inferno: { name: "赤脊鑄造", style: "改建鑄造廠、壓機房與能源庭院", shell: 0xc3a68c, trim: 0x895541, roof: 0x45494b, paving: 0x776c61, tile: 2, landmark: "排熱煙囪", zones: ["壓機庭院", "冷卻站", "輸送中道"] },
});
