export const warningOptions = [
  { id: 'none', label: '无警示语', text: '' },
  { id: 'general', label: '通用消费品 (RO/EN)', text: 'RO: Citiți instrucțiunile înainte de utilizare. A nu se lăsa la îndemâna copiilor. | EN: Read instructions before use. Keep out of reach of children.' },
  { id: 'electronics', label: '电子/带电产品 (RO/EN)', text: 'RO: Feriți de umiditate și temperaturi extreme. Nu dezasamblați. | EN: Keep away from moisture and heat. Do not disassemble.' },
  { id: 'under3', label: '0-3岁儿童窒息警告 (RO/EN)', text: 'RO: AVERTISMENT! Contraindicat copiilor mai mici de 3 ani. Pericol de sufocare. | EN: WARNING! Not suitable for children under 3 years. Choking hazard.' },
  { id: 'textile', label: '鞋服/纺织品 (RO/EN)', text: 'RO: Respectați instrucțiunile de îngrijire de pe etichetă. | EN: Follow care instructions on label.' },
  { id: 'custom', label: '自定义警示语', text: '' },
  { id: 'choking', label: '窒息危险 · 小零件', text: 'AVERTISMENT! Pericol de sufocare. Piese mici. Nu este potrivit pentru copiii sub 3 ani. / WARNING! Choking hazard. Small parts. Not suitable for children under 3 years.' },
  { id: 'adult', label: '成人监督下使用', text: 'AVERTISMENT! A se utiliza sub supravegherea unui adult. / WARNING! Use under adult supervision.' },
  { id: 'bag', label: '塑料袋窒息危险', text: 'AVERTISMENT! Păstrați ambalajul din plastic departe de copii. Pericol de sufocare. / WARNING! Keep plastic packaging away from children. Suffocation hazard.' },
  { id: 'electrical', label: '电气安全', text: 'AVERTISMENT! Nu expuneți la apă. / WARNING! Do not expose to water.' },
];

export const labelSizes = { '50x30': [50, 30], '70x40': [70, 40], '100x100': [100, 100] } as const;
export const MM_PER_PT = 25.4 / 72;
