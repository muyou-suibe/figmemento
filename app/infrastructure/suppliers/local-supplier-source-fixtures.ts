import type {
  LocalSupplierFixture,
  SupplierCatalogMapping,
  SupplierOfferFixture,
  SupplierOfferVariantFixture,
  SupplierQuotedAmount,
  SupplierSourceProvenance,
  SupplierSourceRawValues,
  SupplierWorkbookIdentity,
} from "../../domain/supplier-source.ts";

export const SUPPLIER_WORKBOOK_SOURCE: SupplierWorkbookIdentity = {
  requestedFilename: "8-29FigMemento_供应商对接(1)(2).xlsx",
  reviewedFilename: "8-29FigMemento_供应商对接(1).xlsx",
  reviewedSha256: "f3bbab714041e283a9e7ed3fdf0f9917e799beb678f40ebf02477847bf3c382c",
  supplierSheetName: "供应商对接",
  instructionsSheetName: "填写说明",
  filenameStatus: "requested_copy_unavailable_reviewed_copy_used",
};

const EMPTY_RAW_VALUES: SupplierSourceRawValues = {
  supplierName: null,
  platformOrUrl: null,
  sourceProductLabel: null,
  productType: null,
  quotedPrice: null,
  packagedWeight: null,
  fastestProductionDays: null,
  slowestProductionDays: null,
  video: null,
  returnOrRework: null,
  shanghaiWarehouse: null,
  listingCopy: null,
  photoOrMethodNotes: null,
};

function rawValues(overrides: Partial<SupplierSourceRawValues>): SupplierSourceRawValues {
  return { ...EMPTY_RAW_VALUES, ...overrides };
}

function provenance(
  sourceRow: number,
  values: Partial<SupplierSourceRawValues>,
  reviewStatus: SupplierSourceProvenance["reviewStatus"],
  reviewNote: string,
): SupplierSourceProvenance {
  const raw = rawValues(values);
  return {
    workbook: SUPPLIER_WORKBOOK_SOURCE,
    sheetName: "供应商对接",
    sourceRow,
    sourceUrl: raw.platformOrUrl,
    rawValues: raw,
    reviewStatus,
    reviewNote,
  };
}

function mapping(
  status: "ambiguous" | "unmapped",
  reason: string,
): SupplierCatalogMapping {
  return {
    status,
    productSlug: null,
    skuCode: null,
    mappingKey: null,
    reason,
  };
}

const NO_EXPLICIT_CATALOG_MAPPING =
  "The workbook label does not establish a reviewed FigMemento Product/SKU mapping.";
const DUPLICATE_SOURCE_MAPPING =
  "Supplier coverage is duplicated across source groups; business review must select an explicit FigMemento Product/SKU mapping.";

const JINHUA_URL = "https://shop87q3374707383.1688.com/";
const QUANZHOU_URL = "https://www.1688.com/factory/b2b-340975760257685.html";
const FUZHOU_URL = "https://zhuanshupod.1688.com/";
const YINGHAO_URL = "https://www.1688.com/factory/b2b-22131803052548f338.html";
const PHONE_CASE_URL = "https://item.taobao.com/item.htm?ali_refid=a3_430673_1006%3A1122673229%3AH%3AW5IiXtvLnYMZsr8LzUhwMZbWHkMh5zBs%3A15853233bca5217b8ecb58f10fd0d8ec&ali_trackid=318_15853233bca5217b8ecb58f10fd0d8ec&id=944727802532&loginBonus=1&mi_id=0000-XJssOC_d8VKqKrOgz8m8HwhUjLP7ROUukekM4JZHH4&mm_sceneid=0_0_111003046_0&priceTId=214781e617866084554911891e10d9&skuId=5848631092761&spm=a21n57.sem.item.83&utparam=%7B%22aplus_abtest%22%3A%22d27b0066ef6f7416b495f41bf8544494%22%7D&xxc=ad_ztc";
const TATTOO_URL = "https://baiwenmei.tmall.com/category.htm?spm=pc_detail.30350276.shop_block.dshopinfo.621a7dd6FOBXtN";
const PUZZLE_URL = "https://wanbuke.tmall.com/category.htm?spm=pc_detail.30350276.shop_block.dshopinfo.3c137dd6EAyH3A";
const WOOD_URL = "https://shop35827846.taobao.com/category.htm?spm=pc_detail.30350276.shop_block.dshopinfo.1e967dd6IdtPha";

export const LOCAL_SUPPLIER_FIXTURES: readonly LocalSupplierFixture[] = [
  {
    supplierId: "supplier-jinhua-xinye",
    displayName: "金华市新烨供应链管理有限公司",
    platform: "1688",
    sourceUrl: JINHUA_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "available",
    returnReworkPolicy: "返厂维修，修不了重做；非厂家原因可返厂但不免费",
    notes: "Warehouse and video facts are explicitly present on the supplier-group source row.",
    provenance: [provenance(4, {
      supplierName: "金华市新烨供应链管理有限公司",
      platformOrUrl: JINHUA_URL,
      sourceProductLabel: "3D人偶/手办",
      productType: "实体",
      quotedPrice: "¥160（6cm）",
      packagedWeight: "约50g",
      fastestProductionDays: "5",
      slowestProductionDays: "10",
      video: "✅ 可以",
      returnOrRework: "返厂维修，修不了重做；非厂家原因可返厂但不免费",
      shanghaiWarehouse: "✅ 可以",
    }, "provisional", "Supplier facts are source-backed but await business approval.")],
  },
  {
    supplierId: "supplier-quanzhou-pinguang",
    displayName: "泉州市品冠艺术文化有限公司",
    platform: "1688",
    sourceUrl: QUANZHOU_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "paid",
    returnReworkPolicy: "订制中收工本费；小样确认后按约定比例处理；整体确认后不予退款；运输破损由工厂负责修复",
    notes: "Video is separately paid; the source includes a note that one ¥200 option is not recommended.",
    provenance: [provenance(9, {
      supplierName: "泉州市品冠艺术文化有限公司",
      platformOrUrl: QUANZHOU_URL,
      sourceProductLabel: "3D宠物",
      productType: "实体",
      quotedPrice: "￥130（6cm） / ￥150（8cm） / ￥180（10cm）",
      packagedWeight: "6cm约60g / 8cm约100g / 10cm约150g",
      fastestProductionDays: "3",
      slowestProductionDays: "4",
      video: "需另外付费",
      returnOrRework: "订制中收工本费；小样确认后按约定比例处理；整体确认后不予退款；运输破损由工厂负责修复",
      shanghaiWarehouse: "✅ 可以",
    }, "provisional", "Supplier facts are source-backed but await business approval.")],
  },
  {
    supplierId: "supplier-fuzhou-zhuanshu",
    displayName: "福州祝安鼠电子商务有限公司",
    platform: "1688",
    sourceUrl: FUZHOU_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "unknown",
    returnReworkPolicy: "收到货做货错误或者破损，货品按原单重新补发",
    notes: "The source gives a row-level packaged-weight approximation and separate lamp-base prices.",
    provenance: [provenance(11, {
      supplierName: "福州祝安鼠电子商务有限公司",
      platformOrUrl: FUZHOU_URL,
      sourceProductLabel: "宠物纪念3d水晶",
      productType: "实体",
      quotedPrice: "￥58.39（6cm） / ￥69.8（+木正方形灯座） / ￥67.8（+木原方形灯座） / ￥78.8（+塑料黑色灯座）",
      packagedWeight: "约500g",
      fastestProductionDays: "1",
      slowestProductionDays: "3",
      returnOrRework: "收到货做货错误或者破损，货品按原单重新补发",
      shanghaiWarehouse: "✅ 可以",
    }, "provisional", "Supplier facts are source-backed but await business approval.")],
  },
  {
    supplierId: "supplier-fujian-yinghao",
    displayName: "福建盈浩文化创意股份有限公司",
    platform: "1688",
    sourceUrl: YINGHAO_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "unknown",
    returnReworkPolicy: "质量问题进行赔付或补发",
    notes: "Portrait prices are area-based and method-specific; they are not fixed unit prices.",
    provenance: [provenance(12, {
      supplierName: "福建盈浩文化创意股份有限公司",
      platformOrUrl: YINGHAO_URL,
      sourceProductLabel: "宠物肖像定制画",
      productType: "实体",
      quotedPrice: "平方价；￥122（喷绘） / ￥194（半手绘） / ￥218（肌理打印）",
      packagedWeight: "约500g",
      fastestProductionDays: "2（喷绘、肌理打印） / 3（半手绘）",
      slowestProductionDays: "3（喷绘、肌理打印） / 5（半手绘）",
      returnOrRework: "质量问题进行赔付或补发",
      shanghaiWarehouse: "✅ 可以",
      photoOrMethodNotes: "肌理 / 喷绘 / 手绘",
    }, "provisional", "Area-pricing and method facts are source-backed but await business approval.")],
  },
  {
    supplierId: "supplier-taobao-boluolizhi",
    displayName: "淘宝店 菠萝荔枝",
    platform: "Taobao",
    sourceUrl: PHONE_CASE_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "unknown",
    returnReworkPolicy: null,
    notes: null,
    provenance: [provenance(13, {
      supplierName: "淘宝店 菠萝荔枝",
      platformOrUrl: PHONE_CASE_URL,
      sourceProductLabel: "定制手机壳",
      productType: "实体",
      quotedPrice: "￥11.2（黑色磨砂） / ￥12.5（透明壳） / ￥21.3（太空镜面壳）",
      packagedWeight: "约50g（含包装）",
      fastestProductionDays: "1",
      slowestProductionDays: "3",
      shanghaiWarehouse: "✅ 可以",
      listingCopy: "diy照片手机壳定制情侣来图订制",
      photoOrMethodNotes: "太空镜面壳 / 黑色磨砂 / 透明壳",
    }, "provisional", "Source facts are provisional pending business approval.")],
  },
  {
    supplierId: "supplier-tmall-baiwenmei",
    displayName: "淘宝店 百纹美旗舰店",
    platform: "Tmall",
    sourceUrl: TATTOO_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "available",
    returnReworkPolicy: null,
    notes: "Only the reviewed 18×28cm source size is retained.",
    provenance: [provenance(14, {
      supplierName: "淘宝店 百纹美旗舰店",
      platformOrUrl: TATTOO_URL,
      sourceProductLabel: "定制纹身贴",
      productType: "实体",
      quotedPrice: "￥8.8（18*28厘米） / （不同尺寸",
      packagedWeight: "约5g",
      fastestProductionDays: "1",
      slowestProductionDays: "3",
      video: "✅ 可以",
      shanghaiWarehouse: "✅ 可以",
    }, "provisional", "Source facts are provisional pending business approval.")],
  },
  {
    supplierId: "supplier-tmall-wanbuke",
    displayName: "玩布客旗舰店",
    platform: "Tmall",
    sourceUrl: PUZZLE_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "available",
    returnReworkPolicy: null,
    notes: "Frame add-ons remain source facts and are not promoted to standalone FigMemento SKUs.",
    provenance: [provenance(15, {
      supplierName: "玩布客旗舰店",
      platformOrUrl: PUZZLE_URL,
      sourceProductLabel: "定制拼图",
      productType: "实体",
      quotedPrice: "￥23.5（300片 22寸） / +相框￥43.8 / ￥28.8（500片 22寸） / +相框￥51.7 / ￥35（1000片 30寸） / +相框￥70.2",
      packagedWeight: "300片约400g / 500片约550g / 1000片约1000g（含盒）",
      fastestProductionDays: "1",
      slowestProductionDays: "2",
      video: "✅ 可以",
      shanghaiWarehouse: "✅ 可以",
    }, "provisional", "Source facts are provisional pending business approval.")],
  },
  {
    supplierId: "supplier-taobao-maizi",
    displayName: "麦子创意礼品玩具店",
    platform: "Taobao",
    sourceUrl: WOOD_URL,
    status: "unknown",
    canShipToShanghaiWarehouse: true,
    videoCapability: "available",
    returnReworkPolicy: null,
    notes: null,
    provenance: [provenance(16, {
      supplierName: "麦子创意礼品玩具店",
      platformOrUrl: WOOD_URL,
      sourceProductLabel: "定制木刻画/雕刻画",
      productType: "实体",
      quotedPrice: "￥69.9（6寸） / ￥79（8寸） / ￥89（10寸）",
      packagedWeight: "6寸约400g / 8寸约500g / 10寸约600g",
      fastestProductionDays: "1",
      slowestProductionDays: "2",
      video: "✅ 可以",
      shanghaiWarehouse: "✅ 可以",
    }, "provisional", "Source facts are provisional pending business approval.")],
  },
];

function quotedAmount(
  amountCents: number | null,
  currency: SupplierQuotedAmount["currency"],
  pricingBasis: SupplierQuotedAmount["pricingBasis"],
  priceUnit: SupplierQuotedAmount["priceUnit"],
  rawText: string,
  reviewStatus: SupplierQuotedAmount["reviewStatus"] = "provisional",
): SupplierQuotedAmount {
  return { amountCents, currency, pricingBasis, priceUnit, rawText, reviewStatus };
}

function offer(
  input: Omit<SupplierOfferFixture, "provenance"> & {
    readonly sourceRow: number;
    readonly rawValues: Partial<SupplierSourceRawValues>;
    readonly reviewStatus?: SupplierSourceProvenance["reviewStatus"];
  },
): SupplierOfferFixture {
  const { sourceRow, rawValues: values, reviewStatus = "provisional", ...record } = input;
  return {
    ...record,
    provenance: [provenance(sourceRow, values, reviewStatus, "Source-backed offer facts await explicit business approval.")],
  };
}

function variant(
  input: Omit<SupplierOfferVariantFixture, "provenance"> & {
    readonly sourceRow: number;
    readonly rawValues: Partial<SupplierSourceRawValues>;
    readonly reviewStatus?: SupplierSourceProvenance["reviewStatus"];
  },
): SupplierOfferVariantFixture {
  const { sourceRow, rawValues: values, reviewStatus = "provisional", ...record } = input;
  return {
    ...record,
    provenance: [provenance(sourceRow, values, reviewStatus, "Source-backed variant facts await explicit business approval.")],
  };
}

const physicalOffer = {
  fulfillmentType: "physical" as const,
  isActive: null,
  dimensionsCm: null,
};

const UNKNOWN_VARIANT_WEIGHT_STATUS = "unknown" as const;
const PROVISIONAL_WEIGHT_STATUS = "provisional" as const;

export const LOCAL_SUPPLIER_OFFER_FIXTURES: readonly SupplierOfferFixture[] = [
  offer({
    ...physicalOffer,
    offerId: "offer-jinhua-3d-figure",
    supplierId: "supplier-jinhua-xinye",
    sourceProductLabel: "3D人偶/手办",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 5,
    maxProductionBusinessDays: 10,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "约50g",
    notes: null,
    sourceRow: 4,
    rawValues: { supplierName: "金华市新烨供应链管理有限公司", platformOrUrl: JINHUA_URL, sourceProductLabel: "3D人偶/手办", productType: "实体", quotedPrice: "¥160（6cm）", packagedWeight: "约50g", fastestProductionDays: "5", slowestProductionDays: "10", video: "✅ 可以", returnOrRework: "返厂维修，修不了重做；非厂家原因可返厂但不免费", shanghaiWarehouse: "✅ 可以" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-jinhua-3d-pet",
    supplierId: "supplier-jinhua-xinye",
    sourceProductLabel: "3D宠物",
    catalogMapping: mapping("ambiguous", DUPLICATE_SOURCE_MAPPING),
    minProductionBusinessDays: 5,
    maxProductionBusinessDays: 10,
    canShipToShanghaiWarehouse: null,
    sourcePackagedWeightText: "约40g",
    notes: "One row-level weight covers multiple sizes and is not assigned to individual variants.",
    sourceRow: 5,
    rawValues: { sourceProductLabel: "3D宠物", productType: "实体", quotedPrice: "￥160（6cm） / ￥190（8cm） / ￥200（10cm）", packagedWeight: "约40g", fastestProductionDays: "5", slowestProductionDays: "10" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-jinhua-brick-person",
    supplierId: "supplier-jinhua-xinye",
    sourceProductLabel: "积木人",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 3,
    maxProductionBusinessDays: 4,
    canShipToShanghaiWarehouse: null,
    sourcePackagedWeightText: "约50g",
    notes: "The +画架 ¥6 option is kept as an option surcharge, not flattened into a base price.",
    sourceRow: 6,
    rawValues: { sourceProductLabel: "积木人", productType: "实体", quotedPrice: "¥70（6cm） / (+画架¥6)", packagedWeight: "约50g", fastestProductionDays: "3", slowestProductionDays: "4" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-jinhua-brick-pet",
    supplierId: "supplier-jinhua-xinye",
    sourceProductLabel: "积木宠物",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 3,
    maxProductionBusinessDays: 4,
    canShipToShanghaiWarehouse: null,
    sourcePackagedWeightText: "约50g",
    notes: null,
    sourceRow: 7,
    rawValues: { sourceProductLabel: "积木宠物", productType: "实体", quotedPrice: "￥49（6cm）", packagedWeight: "约50g", fastestProductionDays: "3", slowestProductionDays: "4" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-jinhua-bobblehead",
    supplierId: "supplier-jinhua-xinye",
    sourceProductLabel: "摇头娃娃",
    catalogMapping: mapping("ambiguous", DUPLICATE_SOURCE_MAPPING),
    minProductionBusinessDays: 5,
    maxProductionBusinessDays: 10,
    canShipToShanghaiWarehouse: null,
    sourcePackagedWeightText: "约60g",
    notes: null,
    sourceRow: 8,
    rawValues: { sourceProductLabel: "摇头娃娃", productType: "实体", quotedPrice: "￥168（6cm）", packagedWeight: "约60g", fastestProductionDays: "5", slowestProductionDays: "10" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-quanzhou-3d-pet",
    supplierId: "supplier-quanzhou-pinguang",
    sourceProductLabel: "3D宠物",
    catalogMapping: mapping("ambiguous", DUPLICATE_SOURCE_MAPPING),
    minProductionBusinessDays: 3,
    maxProductionBusinessDays: 4,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "6cm约60g / 8cm约100g / 10cm约150g",
    notes: null,
    sourceRow: 9,
    rawValues: { supplierName: "泉州市品冠艺术文化有限公司", platformOrUrl: QUANZHOU_URL, sourceProductLabel: "3D宠物", productType: "实体", quotedPrice: "￥130（6cm） / ￥150（8cm） / ￥180（10cm）", packagedWeight: "6cm约60g / 8cm约100g / 10cm约150g", fastestProductionDays: "3", slowestProductionDays: "4", video: "需另外付费", shanghaiWarehouse: "✅ 可以" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-quanzhou-bobblehead",
    supplierId: "supplier-quanzhou-pinguang",
    sourceProductLabel: "摇头娃娃",
    catalogMapping: mapping("ambiguous", DUPLICATE_SOURCE_MAPPING),
    minProductionBusinessDays: 3,
    maxProductionBusinessDays: 4,
    canShipToShanghaiWarehouse: null,
    sourcePackagedWeightText: "6cm约70g / 8cm约110g / 10cm约150g（含包装）",
    notes: null,
    sourceRow: 10,
    rawValues: { sourceProductLabel: "摇头娃娃", productType: "实体", quotedPrice: "￥150（6cm） / ￥170（8cm） / ￥200（10cm）", packagedWeight: "6cm约70g / 8cm约110g / 10cm约150g（含包装）", fastestProductionDays: "3", slowestProductionDays: "4" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-fuzhou-pet-crystal",
    supplierId: "supplier-fuzhou-zhuanshu",
    sourceProductLabel: "宠物纪念3d水晶",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 1,
    maxProductionBusinessDays: 3,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "约500g",
    notes: "Base/lamp-base options remain separate variants.",
    sourceRow: 11,
    rawValues: { supplierName: "福州祝安鼠电子商务有限公司", platformOrUrl: FUZHOU_URL, sourceProductLabel: "宠物纪念3d水晶", productType: "实体", quotedPrice: "￥58.39（6cm） / ￥69.8（+木正方形灯座） / ￥67.8（+木原方形灯座） / ￥78.8（+塑料黑色灯座）", packagedWeight: "约500g", fastestProductionDays: "1", slowestProductionDays: "3", shanghaiWarehouse: "✅ 可以" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-yinghao-pet-portrait",
    supplierId: "supplier-fujian-yinghao",
    sourceProductLabel: "宠物肖像定制画",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: null,
    maxProductionBusinessDays: null,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "约500g",
    notes: "Lead time is method-specific and is stored on each method variant.",
    sourceRow: 12,
    rawValues: { supplierName: "福建盈浩文化创意股份有限公司", platformOrUrl: YINGHAO_URL, sourceProductLabel: "宠物肖像定制画", productType: "实体", quotedPrice: "平方价；￥122（喷绘） / ￥194（半手绘） / ￥218（肌理打印）", packagedWeight: "约500g", fastestProductionDays: "2（喷绘、肌理打印） / 3（半手绘）", slowestProductionDays: "3（喷绘、肌理打印） / 5（半手绘）", shanghaiWarehouse: "✅ 可以", photoOrMethodNotes: "肌理 / 喷绘 / 手绘" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-taobao-phone-case",
    supplierId: "supplier-taobao-boluolizhi",
    sourceProductLabel: "定制手机壳",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 1,
    maxProductionBusinessDays: 3,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "约50g（含包装）",
    notes: "Case types remain separate variants; one row-level weight is not copied to each type.",
    sourceRow: 13,
    rawValues: { supplierName: "淘宝店 菠萝荔枝", platformOrUrl: PHONE_CASE_URL, sourceProductLabel: "定制手机壳", productType: "实体", quotedPrice: "￥11.2（黑色磨砂） / ￥12.5（透明壳） / ￥21.3（太空镜面壳）", packagedWeight: "约50g（含包装）", fastestProductionDays: "1", slowestProductionDays: "3", shanghaiWarehouse: "✅ 可以", photoOrMethodNotes: "太空镜面壳 / 黑色磨砂 / 透明壳" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-tmall-temporary-tattoo",
    supplierId: "supplier-tmall-baiwenmei",
    sourceProductLabel: "定制纹身贴",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 1,
    maxProductionBusinessDays: 3,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "约5g",
    notes: "Only 18×28cm is source-backed; other sizes remain unmapped.",
    sourceRow: 14,
    rawValues: { supplierName: "淘宝店 百纹美旗舰店", platformOrUrl: TATTOO_URL, sourceProductLabel: "定制纹身贴", productType: "实体", quotedPrice: "￥8.8（18*28厘米） / （不同尺寸", packagedWeight: "约5g", fastestProductionDays: "1", slowestProductionDays: "3", video: "✅ 可以", shanghaiWarehouse: "✅ 可以" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-tmall-puzzle",
    supplierId: "supplier-tmall-wanbuke",
    sourceProductLabel: "定制拼图",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 1,
    maxProductionBusinessDays: 2,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: null,
    notes: "Frame add-ons remain in raw provenance and are not separate FigMemento variants.",
    sourceRow: 15,
    rawValues: { supplierName: "玩布客旗舰店", platformOrUrl: PUZZLE_URL, sourceProductLabel: "定制拼图", productType: "实体", quotedPrice: "￥23.5（300片 22寸） / +相框￥43.8 / ￥28.8（500片 22寸） / +相框￥51.7 / ￥35（1000片 30寸） / +相框￥70.2", packagedWeight: "300片约400g / 500片约550g / 1000片约1000g（含盒）", fastestProductionDays: "1", slowestProductionDays: "2", video: "✅ 可以", shanghaiWarehouse: "✅ 可以" },
  }),
  offer({
    ...physicalOffer,
    offerId: "offer-taobao-wood-engraving",
    supplierId: "supplier-taobao-maizi",
    sourceProductLabel: "定制木刻画/雕刻画",
    catalogMapping: mapping("unmapped", NO_EXPLICIT_CATALOG_MAPPING),
    minProductionBusinessDays: 1,
    maxProductionBusinessDays: 2,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: null,
    notes: null,
    sourceRow: 16,
    rawValues: { supplierName: "麦子创意礼品玩具店", platformOrUrl: WOOD_URL, sourceProductLabel: "定制木刻画/雕刻画", productType: "实体", quotedPrice: "￥69.9（6寸） / ￥79（8寸） / ￥89（10寸）", packagedWeight: "6寸约400g / 8寸约500g / 10寸约600g", fastestProductionDays: "1", slowestProductionDays: "2", video: "✅ 可以", shanghaiWarehouse: "✅ 可以" },
  }),
];

const sourceValuesFor = (sourceProductLabel: string): Partial<SupplierSourceRawValues> => ({ sourceProductLabel, productType: "实体" });

export const LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES: readonly SupplierOfferVariantFixture[] = [
  variant({ variantId: "variant-jinhua-3d-figure-6cm", offerId: "offer-jinhua-3d-figure", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(16_000, "CNY", "variant_fixed", "per_unit", "¥160（6cm）"), optionSurchargeCents: null, packagedWeightGrams: 50, packagedWeightRawText: "约50g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 5, maxProductionBusinessDays: 10, dimensionsCm: null, sourceVariantText: "6cm / 约50g", notes: null, sourceRow: 4, rawValues: sourceValuesFor("3D人偶/手办") }),
  variant({ variantId: "variant-jinhua-3d-pet-6cm", offerId: "offer-jinhua-3d-pet", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(16_000, "CNY", "variant_fixed", "per_unit", "￥160（6cm）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 5, maxProductionBusinessDays: 10, dimensionsCm: null, sourceVariantText: "6cm / row weight 约40g not size-specific", notes: "Do not copy the row-level approximate weight into this variant.", sourceRow: 5, rawValues: sourceValuesFor("3D宠物") }),
  variant({ variantId: "variant-jinhua-3d-pet-8cm", offerId: "offer-jinhua-3d-pet", variantKey: "8cm", label: "8cm", supplierQuotedAmount: quotedAmount(19_000, "CNY", "variant_fixed", "per_unit", "￥190（8cm）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 5, maxProductionBusinessDays: 10, dimensionsCm: null, sourceVariantText: "8cm / row weight 约40g not size-specific", notes: "Do not copy the row-level approximate weight into this variant.", sourceRow: 5, rawValues: sourceValuesFor("3D宠物") }),
  variant({ variantId: "variant-jinhua-3d-pet-10cm", offerId: "offer-jinhua-3d-pet", variantKey: "10cm", label: "10cm", supplierQuotedAmount: quotedAmount(20_000, "CNY", "variant_fixed", "per_unit", "￥200（10cm）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 5, maxProductionBusinessDays: 10, dimensionsCm: null, sourceVariantText: "10cm / row weight 约40g not size-specific", notes: "Do not copy the row-level approximate weight into this variant.", sourceRow: 5, rawValues: sourceValuesFor("3D宠物") }),
  variant({ variantId: "variant-jinhua-brick-person-6cm", offerId: "offer-jinhua-brick-person", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(7_000, "CNY", "variant_fixed", "per_unit", "¥70（6cm）"), optionSurchargeCents: null, packagedWeightGrams: 50, packagedWeightRawText: "约50g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "6cm / 约50g", notes: null, sourceRow: 6, rawValues: sourceValuesFor("积木人") }),
  variant({ variantId: "variant-jinhua-brick-person-with-easel", offerId: "offer-jinhua-brick-person", variantKey: "6cm-with-easel", label: "6cm + 画架", supplierQuotedAmount: quotedAmount(null, "CNY", "variant_fixed", "unknown", "(+画架¥6)"), optionSurchargeCents: 600, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "6cm + 画架¥6", notes: "Base price plus surcharge is not flattened into a fabricated fixed amount.", sourceRow: 6, rawValues: sourceValuesFor("积木人") }),
  variant({ variantId: "variant-jinhua-brick-pet-6cm", offerId: "offer-jinhua-brick-pet", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(4_900, "CNY", "variant_fixed", "per_unit", "￥49（6cm）"), optionSurchargeCents: null, packagedWeightGrams: 50, packagedWeightRawText: "约50g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "6cm / 约50g", notes: null, sourceRow: 7, rawValues: sourceValuesFor("积木宠物") }),
  variant({ variantId: "variant-jinhua-bobblehead-6cm", offerId: "offer-jinhua-bobblehead", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(16_800, "CNY", "variant_fixed", "per_unit", "￥168（6cm）"), optionSurchargeCents: null, packagedWeightGrams: 60, packagedWeightRawText: "约60g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 5, maxProductionBusinessDays: 10, dimensionsCm: null, sourceVariantText: "6cm / 约60g", notes: null, sourceRow: 8, rawValues: sourceValuesFor("摇头娃娃") }),
  variant({ variantId: "variant-quanzhou-3d-pet-6cm", offerId: "offer-quanzhou-3d-pet", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(13_000, "CNY", "variant_fixed", "per_unit", "￥130（6cm）"), optionSurchargeCents: null, packagedWeightGrams: 60, packagedWeightRawText: "6cm约60g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "6cm / 约60g", notes: null, sourceRow: 9, rawValues: sourceValuesFor("3D宠物") }),
  variant({ variantId: "variant-quanzhou-3d-pet-8cm", offerId: "offer-quanzhou-3d-pet", variantKey: "8cm", label: "8cm", supplierQuotedAmount: quotedAmount(15_000, "CNY", "variant_fixed", "per_unit", "￥150（8cm）"), optionSurchargeCents: null, packagedWeightGrams: 100, packagedWeightRawText: "8cm约100g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "8cm / 约100g", notes: null, sourceRow: 9, rawValues: sourceValuesFor("3D宠物") }),
  variant({ variantId: "variant-quanzhou-3d-pet-10cm", offerId: "offer-quanzhou-3d-pet", variantKey: "10cm", label: "10cm", supplierQuotedAmount: quotedAmount(18_000, "CNY", "variant_fixed", "per_unit", "￥180（10cm）"), optionSurchargeCents: null, packagedWeightGrams: 150, packagedWeightRawText: "10cm约150g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "10cm / 约150g", notes: null, sourceRow: 9, rawValues: sourceValuesFor("3D宠物") }),
  variant({ variantId: "variant-quanzhou-bobblehead-6cm", offerId: "offer-quanzhou-bobblehead", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(15_000, "CNY", "variant_fixed", "per_unit", "￥150（6cm）"), optionSurchargeCents: null, packagedWeightGrams: 70, packagedWeightRawText: "6cm约70g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "6cm / 约70g", notes: null, sourceRow: 10, rawValues: sourceValuesFor("摇头娃娃") }),
  variant({ variantId: "variant-quanzhou-bobblehead-8cm", offerId: "offer-quanzhou-bobblehead", variantKey: "8cm", label: "8cm", supplierQuotedAmount: quotedAmount(17_000, "CNY", "variant_fixed", "per_unit", "￥170（8cm）"), optionSurchargeCents: null, packagedWeightGrams: 110, packagedWeightRawText: "8cm约110g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "8cm / 约110g", notes: null, sourceRow: 10, rawValues: sourceValuesFor("摇头娃娃") }),
  variant({ variantId: "variant-quanzhou-bobblehead-10cm", offerId: "offer-quanzhou-bobblehead", variantKey: "10cm", label: "10cm", supplierQuotedAmount: quotedAmount(20_000, "CNY", "variant_fixed", "per_unit", "￥200（10cm）"), optionSurchargeCents: null, packagedWeightGrams: 150, packagedWeightRawText: "10cm约150g（含包装）", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 4, dimensionsCm: null, sourceVariantText: "10cm / 约150g（含包装）", notes: null, sourceRow: 10, rawValues: sourceValuesFor("摇头娃娃") }),
  variant({ variantId: "variant-fuzhou-crystal-6cm", offerId: "offer-fuzhou-pet-crystal", variantKey: "6cm", label: "6cm", supplierQuotedAmount: quotedAmount(5_839, "CNY", "variant_fixed", "per_unit", "￥58.39（6cm）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "6cm / row weight 约500g not base-specific", notes: "Do not copy the row-level approximate weight across base options.", sourceRow: 11, rawValues: sourceValuesFor("宠物纪念3d水晶") }),
  variant({ variantId: "variant-fuzhou-crystal-wood-square-base", offerId: "offer-fuzhou-pet-crystal", variantKey: "wood-square-base", label: "+ 木正方形灯座", supplierQuotedAmount: quotedAmount(6_980, "CNY", "variant_fixed", "per_unit", "￥69.8（+木正方形灯座）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "+木正方形灯座 / row weight 约500g not base-specific", notes: "Base option remains separate.", sourceRow: 11, rawValues: sourceValuesFor("宠物纪念3d水晶") }),
  variant({ variantId: "variant-fuzhou-crystal-original-square-base", offerId: "offer-fuzhou-pet-crystal", variantKey: "original-square-base", label: "+ 木原方形灯座", supplierQuotedAmount: quotedAmount(6_780, "CNY", "variant_fixed", "per_unit", "￥67.8（+木原方形灯座）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "+木原方形灯座 / row weight 约500g not base-specific", notes: "Base option remains separate.", sourceRow: 11, rawValues: sourceValuesFor("宠物纪念3d水晶") }),
  variant({ variantId: "variant-fuzhou-crystal-black-plastic-base", offerId: "offer-fuzhou-pet-crystal", variantKey: "black-plastic-base", label: "+ 塑料黑色灯座", supplierQuotedAmount: quotedAmount(7_880, "CNY", "variant_fixed", "per_unit", "￥78.8（+塑料黑色灯座）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "+塑料黑色灯座 / row weight 约500g not base-specific", notes: "Base option remains separate.", sourceRow: 11, rawValues: sourceValuesFor("宠物纪念3d水晶") }),
  variant({ variantId: "variant-yinghao-portrait-spray", offerId: "offer-yinghao-pet-portrait", variantKey: "spray", label: "喷绘", supplierQuotedAmount: quotedAmount(12_200, "CNY", "area_based", "per_area", "￥122（喷绘）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 2, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "喷绘 / 平方价 / 约500g", notes: "Area-based; not a fixed unit cost.", sourceRow: 12, rawValues: sourceValuesFor("宠物肖像定制画") }),
  variant({ variantId: "variant-yinghao-portrait-semi-hand-painted", offerId: "offer-yinghao-pet-portrait", variantKey: "semi-hand-painted", label: "半手绘", supplierQuotedAmount: quotedAmount(19_400, "CNY", "area_based", "per_area", "￥194（半手绘）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 3, maxProductionBusinessDays: 5, dimensionsCm: null, sourceVariantText: "半手绘 / 平方价 / 约500g", notes: "Area-based; not a fixed unit cost.", sourceRow: 12, rawValues: sourceValuesFor("宠物肖像定制画") }),
  variant({ variantId: "variant-yinghao-portrait-texture-print", offerId: "offer-yinghao-pet-portrait", variantKey: "texture-print", label: "肌理打印", supplierQuotedAmount: quotedAmount(21_800, "CNY", "area_based", "per_area", "￥218（肌理打印）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 2, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "肌理打印 / 平方价 / 约500g", notes: "Area-based; not a fixed unit cost.", sourceRow: 12, rawValues: sourceValuesFor("宠物肖像定制画") }),
  variant({ variantId: "variant-phone-case-black-matte", offerId: "offer-taobao-phone-case", variantKey: "black-matte", label: "黑色磨砂", supplierQuotedAmount: quotedAmount(1_120, "CNY", "variant_fixed", "per_unit", "￥11.2（黑色磨砂）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "黑色磨砂 / row weight 约50g（含包装） not type-specific", notes: "Do not copy the row-level approximate weight across case types.", sourceRow: 13, rawValues: sourceValuesFor("定制手机壳") }),
  variant({ variantId: "variant-phone-case-transparent", offerId: "offer-taobao-phone-case", variantKey: "transparent", label: "透明壳", supplierQuotedAmount: quotedAmount(1_250, "CNY", "variant_fixed", "per_unit", "￥12.5（透明壳）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "透明壳 / row weight 约50g（含包装） not type-specific", notes: "Do not copy the row-level approximate weight across case types.", sourceRow: 13, rawValues: sourceValuesFor("定制手机壳") }),
  variant({ variantId: "variant-phone-case-space-mirror", offerId: "offer-taobao-phone-case", variantKey: "space-mirror", label: "太空镜面壳", supplierQuotedAmount: quotedAmount(2_130, "CNY", "variant_fixed", "per_unit", "￥21.3（太空镜面壳）"), optionSurchargeCents: null, packagedWeightGrams: null, packagedWeightRawText: null, packagedWeightReviewStatus: UNKNOWN_VARIANT_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "太空镜面壳 / row weight 约50g（含包装） not type-specific", notes: "Do not copy the row-level approximate weight across case types.", sourceRow: 13, rawValues: sourceValuesFor("定制手机壳") }),
  variant({ variantId: "variant-temporary-tattoo-18x28cm", offerId: "offer-tmall-temporary-tattoo", variantKey: "18x28cm", label: "18 × 28 cm", supplierQuotedAmount: quotedAmount(880, "CNY", "variant_fixed", "per_unit", "￥8.8（18*28厘米）"), optionSurchargeCents: null, packagedWeightGrams: 5, packagedWeightRawText: "约5g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 3, dimensionsCm: null, sourceVariantText: "18 × 28 cm / 约5g", notes: "No other source-backed sizes are added.", sourceRow: 14, rawValues: sourceValuesFor("定制纹身贴") }),
  variant({ variantId: "variant-puzzle-300-pieces", offerId: "offer-tmall-puzzle", variantKey: "300-pieces", label: "300片", supplierQuotedAmount: quotedAmount(2_350, "CNY", "variant_fixed", "per_unit", "￥23.5（300片 22寸）"), optionSurchargeCents: null, packagedWeightGrams: 400, packagedWeightRawText: "300片约400g（含盒）", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 2, dimensionsCm: null, sourceVariantText: "300片 / 22寸 / 约400g（含盒）", notes: "Frame surcharge is preserved only in source provenance.", sourceRow: 15, rawValues: sourceValuesFor("定制拼图") }),
  variant({ variantId: "variant-puzzle-500-pieces", offerId: "offer-tmall-puzzle", variantKey: "500-pieces", label: "500片", supplierQuotedAmount: quotedAmount(2_880, "CNY", "variant_fixed", "per_unit", "￥28.8（500片 22寸）"), optionSurchargeCents: null, packagedWeightGrams: 550, packagedWeightRawText: "500片约550g（含盒）", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 2, dimensionsCm: null, sourceVariantText: "500片 / 22寸 / 约550g（含盒）", notes: "Frame surcharge is preserved only in source provenance.", sourceRow: 15, rawValues: sourceValuesFor("定制拼图") }),
  variant({ variantId: "variant-puzzle-1000-pieces", offerId: "offer-tmall-puzzle", variantKey: "1000-pieces", label: "1000片", supplierQuotedAmount: quotedAmount(3_500, "CNY", "variant_fixed", "per_unit", "￥35（1000片 30寸）"), optionSurchargeCents: null, packagedWeightGrams: 1_000, packagedWeightRawText: "1000片约1000g（含盒）", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 2, dimensionsCm: null, sourceVariantText: "1000片 / 30寸 / 约1000g（含盒）", notes: "Frame surcharge is preserved only in source provenance.", sourceRow: 15, rawValues: sourceValuesFor("定制拼图") }),
  variant({ variantId: "variant-wood-engraving-6in", offerId: "offer-taobao-wood-engraving", variantKey: "6in", label: "6寸", supplierQuotedAmount: quotedAmount(6_990, "CNY", "variant_fixed", "per_unit", "￥69.9（6寸）"), optionSurchargeCents: null, packagedWeightGrams: 400, packagedWeightRawText: "6寸约400g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 2, dimensionsCm: null, sourceVariantText: "6寸 / 约400g", notes: null, sourceRow: 16, rawValues: sourceValuesFor("定制木刻画/雕刻画") }),
  variant({ variantId: "variant-wood-engraving-8in", offerId: "offer-taobao-wood-engraving", variantKey: "8in", label: "8寸", supplierQuotedAmount: quotedAmount(7_900, "CNY", "variant_fixed", "per_unit", "￥79（8寸）"), optionSurchargeCents: null, packagedWeightGrams: 500, packagedWeightRawText: "8寸约500g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 2, dimensionsCm: null, sourceVariantText: "8寸 / 约500g", notes: null, sourceRow: 16, rawValues: sourceValuesFor("定制木刻画/雕刻画") }),
  variant({ variantId: "variant-wood-engraving-10in", offerId: "offer-taobao-wood-engraving", variantKey: "10in", label: "10寸", supplierQuotedAmount: quotedAmount(8_900, "CNY", "variant_fixed", "per_unit", "￥89（10寸）"), optionSurchargeCents: null, packagedWeightGrams: 600, packagedWeightRawText: "10寸约600g", packagedWeightReviewStatus: PROVISIONAL_WEIGHT_STATUS, minProductionBusinessDays: 1, maxProductionBusinessDays: 2, dimensionsCm: null, sourceVariantText: "10寸 / 约600g", notes: null, sourceRow: 16, rawValues: sourceValuesFor("定制木刻画/雕刻画") }),
];

export const DIGITAL_CATALOG_PRODUCT_SLUGS = [
  "digital-portrait",
  "ai-oil-portrait",
  "digital-wallpaper",
] as const;

export const UNMAPPED_CATALOG_PRODUCT_SLUGS = [
  "ai-oil-portrait",
  "bobblehead",
  "brick-person",
  "couple-figure",
  "crystal-frame",
  "custom-pillow",
  "custom-puzzle",
  "digital-portrait",
  "digital-wallpaper",
  "figurine-keychain",
  "fridge-magnet",
  "glass-light-picture",
  "herbal-tattoo",
  "leaf-engraving",
  "pet-figure",
  "pet-memorial",
  "pet-portrait",
  "phone-case",
  "pixel-cube",
  "solo-figure",
  "temporary-tattoo",
  "wood-engraving",
] as const;

export interface LocalSupplierSourceFixtures {
  readonly suppliers: readonly LocalSupplierFixture[];
  readonly offers: readonly SupplierOfferFixture[];
  readonly variants: readonly SupplierOfferVariantFixture[];
}

export const LOCAL_SUPPLIER_SOURCE_FIXTURES: LocalSupplierSourceFixtures = {
  suppliers: LOCAL_SUPPLIER_FIXTURES,
  offers: LOCAL_SUPPLIER_OFFER_FIXTURES,
  variants: LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES,
};
