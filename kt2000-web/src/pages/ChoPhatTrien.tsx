import { Card, Typography } from "antd";

export default function ChoPhatTrien({ title }: { title: string }) {
  return (
    <Card title={title}>
      <Typography.Text type="secondary">
        Chức năng thuộc gói công việc sau — xem docs/SPEC-000.
      </Typography.Text>
    </Card>
  );
}