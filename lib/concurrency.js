'use strict';

/**
 * 受控并发的工具函数。
 * 抓取 favicon / 页面标题属于网络 IO，全量并行容易触发目标站点的限流，
 * 因此用固定数量的 worker 依次消费任务队列。
 */

/**
 * 以受限并发对数组做异步映射
 * @template T, R
 * @param {T[]} items
 * @param {number} limit 最大并发数
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>} 与输入等长、顺序一致的结果
 */
async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    if (items.length === 0) return results;

    const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
    let cursor = 0;

    const worker = async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(items[index], index);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

module.exports = { mapWithConcurrency };
