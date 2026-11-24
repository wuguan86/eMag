import { useEffect, useRef, useState } from 'react';
import type { useGpsrLabelDraft } from '../storage/gpsrLabelDraft';
import type { GpsrLabelDraft, LocalizedText, ProductNameSource, ProductSnapshot } from '../types';
import { createDefaultGpsrLabelDraft } from '../utils/gpsrLabel';
import { refineProductName, translateProductName } from '../utils/gpsrTranslation';
import { readCurrentProductName } from '../utils/productImport';

type PendingNameAction = 'import' | 'refine' | 'translate' | null;

export function useGpsrProductNames(label: ReturnType<typeof useGpsrLabelDraft>, product: ProductSnapshot | null) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingNameAction>(null);
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);

  const invalidate = (nextMessage: string) => {
    operation.current += 1;
    setPending(null);
    setMessage(nextMessage);
  };

  const start = (action: PendingNameAction, status: string) => {
    operation.current += 1;
    setPending(action);
    setMessage(status);
    return operation.current;
  };

  const canApply = (id: number, expected: GpsrLabelDraft) => {
    // 同窗口先检查操作编号，跨窗口再核对最新草稿，避免慢响应覆盖已同步的编辑。
    if (id !== operation.current) return false;
    if (label.isCurrentName(expected)) return true;
    setMessage('品名已修改，已忽略过期结果。');
    return false;
  };

  const finish = (id: number) => {
    if (id === operation.current) setPending(null);
  };

  const refineFromSource = async (id: number, source: ProductNameSource, expected: GpsrLabelDraft) => {
    try {
      const refined = await refineProductName(source.text, source.language);
      if (!canApply(id, expected)) return;
      label.setRefinedName(refined);
      setMessage(source.language ? '短品名已填入，请核对后翻译。' : '短品名已填入，请确认原文语言后翻译。');
    } catch (error) {
      if (canApply(id, expected)) setMessage(error instanceof Error ? error.message : '提炼失败，请重试或手填短品名。');
    }
  };

  const importProduct = async () => {
    const id = start('import', '正在读取商品标题…');
    const expected = label.currentDraft();
    try {
      const source = await readCurrentProductName(product);
      if (!canApply(id, expected)) return;
      const imported = label.setProductNameSource(source);
      setPending('refine');
      setMessage('已导入原标题，正在提炼短品名…');
      await refineFromSource(id, source, imported);
    } catch (error) {
      if (canApply(id, expected)) setMessage(error instanceof Error ? error.message : '商品标题读取失败，请重试。');
    } finally { finish(id); }
  };

  const refine = async () => {
    const id = start('refine', '正在提炼短品名…');
    const expected = label.currentDraft();
    try { await refineFromSource(id, expected.productNameSource, expected); }
    finally { finish(id); }
  };

  const translate = async () => {
    const id = start('translate', '正在请求翻译…');
    const expected = label.currentDraft();
    try {
      const source = expected.productNameSource;
      const translations = await translateProductName(expected.productNameRefined?.trim() || source.text, source.language);
      if (canApply(id, expected) && label.applyTranslations(expected, translations)) {
        setMessage('中文对照和三语品名已填入，请核对后再导出。');
      }
    } catch (error) {
      if (canApply(id, expected)) setMessage(error instanceof Error ? error.message : '翻译失败，请稍后重试。');
    } finally { finish(id); }
  };

  const setSource = (source: ProductNameSource) => {
    const current = label.currentDraft();
    if (source.text === current.productNameSource.text && source.language !== current.productNameSource.language
      && !current.productNameSource.language && current.productNameRefined?.trim()) {
      // 未知语种首次确认沿用已生成的短品名，后续改选语种需要重新提炼。
      label.setProductNameSource(source, current.productNameRefined);
      invalidate('原文语言已确认，请核对短品名后翻译。');
      return;
    }
    label.setProductNameSource(source);
    invalidate('原文或语言已更新，请核对品名后重新翻译。');
  };

  const setShortName = (value: string) => {
    label.setRefinedName(value);
    invalidate('短品名已更新，请重新翻译。');
  };

  const setName = (language: keyof LocalizedText, value: string) => {
    label.setProductName(language, value);
    invalidate('');
  };

  const resetProduct = () => {
    label.setDraft({
      ...label.currentDraft(), productNameSource: { text: '', language: 'zh-CN' }, productNameRefined: '',
      productName: { zh: '', ro: '', bg: '', hu: '' }, material: '', model: '', productSize: '',
      batch: createDefaultGpsrLabelDraft().batch, ean13: '', manualUrl: '',
    });
    invalidate('产品信息已清空，打印规格、企业资料和适用标志已保留。');
  };

  return { message, pending, importProduct, refine, translate, setSource, setShortName, setName, resetProduct };
}
