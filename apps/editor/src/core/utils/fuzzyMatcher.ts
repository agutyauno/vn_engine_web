/**
 * Tính toán khoảng cách Levenshtein giữa hai chuỗi ký tự.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array<number>(n + 1);
  let currRow = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const c2 = s2.charCodeAt(j - 1);
      const cost = c1 === c2 ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1]! + 1,      // insertion
        prevRow[j]! + 1,          // deletion
        prevRow[j - 1]! + cost,   // substitution
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[n]!;
}

/**
 * Tìm các từ khóa gần giống nhất sử dụng thuật toán Levenshtein với Early Length Pruning.
 *
 * @param query Chuỗi tìm kiếm
 * @param candidates Danh sách ứng viên
 * @param maxDistance Khoảng cách chỉnh sửa tối đa cho phép (mặc định 2)
 * @param maxResults Số lượng kết quả tối đa trả về (mặc định 2)
 * @returns Mảng các chuỗi ứng viên gốc gần nhất sắp xếp theo khoảng cách tăng dần
 */
export function findClosestMatches(
  query: string,
  candidates: string[],
  maxDistance = 2,
  maxResults = 2,
): string[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery || candidates.length === 0) {
    return [];
  }

  const lowerQuery = trimmedQuery.toLowerCase();
  const scored: Array<{ candidate: string; distance: number }> = [];

  for (const candidate of candidates) {
    const trimmedCand = candidate.trim();
    if (!trimmedCand) continue;

    // Early length pruning: độ chênh lệch chiều dài lớn hơn maxDistance thì bỏ qua
    if (Math.abs(lowerQuery.length - trimmedCand.length) > maxDistance) {
      continue;
    }

    const dist = levenshteinDistance(lowerQuery, trimmedCand.toLowerCase());
    if (dist <= maxDistance) {
      scored.push({ candidate, distance: dist });
    }
  }

  // Sắp xếp theo khoảng cách tăng dần
  scored.sort((a, b) => a.distance - b.distance);

  return scored.slice(0, maxResults).map(s => s.candidate);
}

