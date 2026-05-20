export function getMonthRange(date: Date = new Date()): { from: string; to: string } {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function getWeekRange(date: Date = new Date()): { from: string; to: string } {
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split("T")[0],
    to: sunday.toISOString().split("T")[0],
  };
}

export function getDayRange(date: Date = new Date()): { from: string; to: string } {
  const d = date.toISOString().split("T")[0];
  return { from: d, to: d };
}
