import { Spin } from "antd";

export default function DangTai({
  loi = "Đang tải dữ liệu",
  dayKhung = false,
  co = "large",
}: {
  /** Chữ hiện dưới vòng quay. */
  loi?: string;
  dayKhung?: boolean;
  co?: "small" | "default" | "large";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...(dayKhung ? { height: "100%" } : { minHeight: 240 }),
      }}
    >
      <Spin tip={loi} size={co} />
    </div>
  );
}
