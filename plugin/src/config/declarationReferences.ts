export const declarationReferences = [
  { id: 'general', label: '普通非带电日用品 (GPSR)', legislation: 'Regulation (EU) 2023/988 (GPSR)', standards: 'EN ISO 12100 (示例，请按产品核对)' },
  { id: 'electronics', label: '带电/USB低压电子产品 (EMC/LVD/RoHS)', legislation: '2014/30/EU (EMC), 2014/35/EU (LVD), 2011/65/EU (RoHS)', standards: 'EN 55032, EN 55035, EN 62368-1' },
  { id: 'wireless', label: '无线/蓝牙设备 (RED/RoHS)', legislation: '2014/53/EU (RED), 2011/65/EU (RoHS)', standards: 'ETSI EN 300 328, EN 62368-1' },
  { id: 'toys', label: '儿童玩具类 (Toy Safety)', legislation: 'Directive 2009/48/EC', standards: 'EN 71-1, EN 71-2, EN 71-3' },
  { id: 'textile', label: '鞋靴/服装纺织品', legislation: 'Regulation (EU) No 1007/2011, REACH (EC) No 1907/2006, (EU) 2023/988', standards: 'EN ISO 13688 / 产品材质标准' },
] as const;
