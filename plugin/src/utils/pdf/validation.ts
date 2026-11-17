import type { ComplianceProfile } from '../../types';
import { unsupportedCharacters, type FontAssets } from './text';

export function profileSections(profile: ComplianceProfile) {
  const company = (label: string, value: ComplianceProfile['euRep']) => [
    { region: label, text: `${label === '欧盟责任人' ? 'EU Rep' : 'Manufacturer'}: ${value.name}` },
    { region: label, text: value.address },
    { region: label, text: `${value.email}${value.phone.trim() ? ` | Tel: ${value.phone}` : ''}` },
  ];
  return [
    { region: '产品名称', text: profile.productName },
    { region: '型号与批次', text: `Model: ${profile.model} | Batch: ${profile.batch}` },
    ...company('欧盟责任人', profile.euRep), ...company('制造商', profile.manufacturer),
  ];
}

export function validateProfile(profile: ComplianceProfile, assets: FontAssets) {
  const errors: string[] = [];
  const required = [[profile.productName, '产品名称'], [profile.model, '型号'], [profile.batch, '批次号']];
  for (const [label, company] of [['欧盟责任人', profile.euRep], ['制造商', profile.manufacturer]] as const) {
    required.push([company.name, `${label}公司名称`], [company.address, `${label}地址`], [company.email, `${label}邮箱`]);
  }
  for (const [value, label] of required) if (!value.trim()) errors.push(`请填写${label}。`);
  for (const section of profileSections(profile)) {
    const unsupported = unsupportedCharacters(section.text, assets);
    if (unsupported.length) errors.push(`${section.region}包含离线字体不支持的字符：${unsupported.join(' ')}。请改用可打印字符。`);
  }
  return errors;
}

// 警示语由预设或用户输入独立提供，必须校验最终文本，避免绕过主体信息的字体检查。
export function validateWarning(text: string, region: string, assets: FontAssets) {
  const errors: string[] = [];
  if (!text.trim()) errors.push(`请填写${region}。`);
  const controls = [...text].filter((character) => {
    const code = character.codePointAt(0)!;
    return (code < 32 && character !== '\n' && character !== '\r') || (code >= 127 && code <= 159);
  });
  if (controls.length) errors.push(`${region}包含控制字符，请删除不可打印字符。`);
  const unsupported = unsupportedCharacters(text, assets);
  if (unsupported.length) errors.push(`${region}包含离线字体不支持的字符：${unsupported.join(' ')}。请改用可打印字符。`);
  return errors;
}
