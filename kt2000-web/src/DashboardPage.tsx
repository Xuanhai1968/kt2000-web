import { Card, Descriptions, Button, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function DashboardPage() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  if (!session) { nav("/"); return null; }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <Card
        title="Phiên làm việc"
        extra={<Button onClick={() => { signOut(); nav("/"); }}>Đăng xuất</Button>}
      >
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Người dùng">
            {session.user.realName} ({session.user.loginName})
            {session.user.isAdmin && <Tag color="red" style={{ marginLeft: 8 }}>Admin</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Đơn vị">
            {session.tenant.code} — {session.tenant.name}
          </Descriptions.Item>
          <Descriptions.Item label="Database">{session.tenant.dbName}</Descriptions.Item>
          <Descriptions.Item label="Năm làm việc">{session.fiscalYear}</Descriptions.Item>
          {session.branches.length > 0 && (
            <Descriptions.Item label="Chi nhánh">
              {session.branches.map(b => <Tag key={b.code}>{b.code}</Tag>)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    </div>
  );
}