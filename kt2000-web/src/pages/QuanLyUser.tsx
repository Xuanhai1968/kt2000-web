import { useEffect, useMemo, useState } from "react";
import {
  Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space,
  Typography, Alert, Popconfirm, message,
} from "antd";
import {
  getUsers, createUser, setUserActive, resetUserPassword, setUserRole, getAdminTenants,
  viewInitialPassword, deleteUser, loiApi,
} from "../api";
import type { AdminUser, AdminTenant } from "../api";
import { useAuth } from "../AuthContext";
import "./luoi-gon.css";

// Vai trò trong một đơn vị. Bên thuế hiện chỉ dùng 'accountant'; hai vai cuối dành
// cho tenant nội bộ theo mục 5 SPEC-KT2000-NB.
const VAI_TRO = [
  { value: "accountant", label: "Kế toán (thuế)" },
  { value: "admin", label: "Quản lý đơn vị" },
  { value: "nhap_don", label: "Nhập đơn (NB)" },
  { value: "quan_ly", label: "Quản lý (NB)" },
];

// Giá trị các ô của form tạo người dùng. Khai tường minh thay vì `any`: đổi tên ô mà
// quên sửa chỗ đọc thì TypeScript bắt ngay.
interface OToUserMoi {
  loginName: string;
  realName?: string;
  matKhau: string;
  isAdmin?: boolean;
  tenantId?: string;
  role?: string;
}

export default function QuanLyUser() {
  const { session } = useAuth();
  const laAdmin = !!session?.user.isAdmin;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);

  const dsUser = useMemo(
    () => [...users].sort((a, b) => a.loginName.localeCompare(b.loginName, "vi")),
    [users]);
  const [dangTai, setDangTai] = useState(true);
  const [moTao, setMoTao] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [formTao] = Form.useForm();

  // Modal cấp quyền / đặt lại mật khẩu cho một user cụ thể
  const [userDangSua, setUserDangSua] = useState<AdminUser | null>(null);
  const [formQuyen] = Form.useForm();
  const [mkMoi, setMkMoi] = useState("");

  const napLai = () => {
    setDangTai(true);
    Promise.all([getUsers(), getAdminTenants(true)])
      .then(([u, t]) => { setUsers(u.data); setTenants(t.data); })
      .catch((e) => message.error(loiApi(e, "Không tải được danh sách người dùng")))
      .finally(() => setDangTai(false));
  };
  // setTimeout 0: napLai() bật cờ "đang tải" NGAY khi gọi, mà setState đồng bộ trong
  // thân effect bị React coi là render dây chuyền.
  useEffect(() => {
    const id = setTimeout(napLai, 0);
    return () => clearTimeout(id);
  }, []);

  const taoUser = async (v: OToUserMoi) => {
    setDangLuu(true);
    try {
      const r = await createUser({
        loginName: v.loginName.trim(), realName: v.realName, matKhau: v.matKhau,
        isAdmin: !!v.isAdmin, tenantId: v.tenantId, role: v.role ?? "accountant",
      });
      message.success(r.data.message ?? "Đã tạo người dùng");
      setMoTao(false); formTao.resetFields(); napLai();
    } catch (e) {
      message.error(loiApi(e, "Không tạo được người dùng"));
    } finally { setDangLuu(false); }
  };

  // Xem lại mật khẩu admin đã cấp — chỉ được khi người dùng chưa tự đổi
  const xemMatKhau = async (u: AdminUser) => {
    try {
      const r = await viewInitialPassword(u.id);
      Modal.info({
        title: `Mật khẩu đã cấp cho ${r.data.loginName}`,
        width: 460,
        content: (
          <div style={{ marginTop: 12 }}>
            <Input.TextArea readOnly autoSize value={r.data.matKhau}
                            style={{ fontFamily: "monospace", fontSize: 16 }} />
            <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0 }}>
              Bôi đen để sao chép. Người dùng đổi mật khẩu xong thì mục này biến mất —
              lúc đó muốn cấp lại phải bấm <b>Đặt lại</b>.
            </Typography.Paragraph>
          </div>
        ),
      });
    } catch (e) {
      message.warning(loiApi(e, "Không xem được mật khẩu"));
    }
  };

  const xoaUser = async (u: AdminUser) => {
    try {
      const r = await deleteUser(u.id);
      message.success(r.data.message);
      napLai();
    } catch (e) {
      message.error(loiApi(e, "Không xóa được tài khoản"));
    }
  };

  const doiTrangThai = async (u: AdminUser) => {
    try {
      const r = await setUserActive(u.id, !u.isActive);
      message.success(r.data.message);
      napLai();
    } catch (e) {
      message.error(loiApi(e, "Không đổi được trạng thái"));
    }
  };

  const datLaiMatKhau = async () => {
    if (!userDangSua) return;
    try {
      const r = await resetUserPassword(userDangSua.id, mkMoi);
      message.success(r.data.message);
      setMkMoi(""); napLai();
    } catch (e) {
      message.error(loiApi(e, "Không đặt lại được mật khẩu"));
    }
  };

  const capQuyen = async (tenantId: string, role: string | null) => {
    if (!userDangSua) return;
    try {
      const r = await setUserRole(userDangSua.id, tenantId, role);
      message.success(r.data.message);
      formQuyen.resetFields();
      napLai();
    } catch (e) {
      message.error(loiApi(e, "Không cấp được quyền"));
    }
  };

  // Modal phải đọc theo bản vừa tải lại, không phải bản chụp lúc bấm nút
  const userHienTai = userDangSua
    ? users.find((x) => x.id === userDangSua.id) ?? userDangSua : null;

  return (
    <Card
      title="Quản lý người dùng"
      extra={
        <Button type="primary" disabled={!laAdmin} onClick={() => setMoTao(true)}
                title={laAdmin ? undefined : "Chỉ quản trị viên được tạo người dùng"}>
          Thêm người dùng
        </Button>
      }
    >
      {!laAdmin && (
        <Alert style={{ marginBottom: 12 }} type="info" showIcon
               message="Chỉ quản trị viên mới thao tác được ở màn hình này" />
      )}

      <Table
        className="luoi-gon" rowKey="id" size="small" loading={dangTai}
        dataSource={dsUser} pagination={false}
        scroll={{ y: "calc(100vh - 300px)" }}
        columns={[
          { title: "STT", width: 46, align: "center",
            render: (_: unknown, __: AdminUser, i: number) => i + 1 },
          { title: "Tên đăng nhập", dataIndex: "loginName", width: 160,
            render: (v: string, r: AdminUser) => (
              <span style={{ textDecoration: r.isActive ? undefined : "line-through",
                             color: r.isActive ? undefined : "#999" }}>
                <b>{v}</b>
              </span>
            ) },
          { title: "Họ tên", dataIndex: "realName", width: 200 },
          { title: "Quản trị", dataIndex: "isAdmin", width: 90,
            render: (v: boolean) => v ? <Tag color="purple">Admin</Tag> : null },
          { title: "Trạng thái", dataIndex: "isActive", width: 110,
            render: (v: boolean) => v
              ? <Tag color="green">Hoạt động</Tag>
              : <Tag color="red">Đã khóa</Tag> },
          { title: "Mật khẩu", dataIndex: "mustChangePassword", width: 200,
            render: (v: boolean, r: AdminUser) => v
              ? <Space size={4}>
                  <Tag color="orange" title="Lần đăng nhập tới sẽ bị bắt đổi">Phải đổi</Tag>
                  <Button size="small" disabled={!laAdmin} onClick={() => xemMatKhau(r)}>
                    Xem
                  </Button>
                </Space>
              : <Tag title="Người dùng đã tự đổi — không xem lại được nữa">Họ đã đổi</Tag> },
          { title: "Đơn vị được vào", dataIndex: "donVi",
            render: (ds: AdminUser["donVi"]) => ds.length === 0
              ? <Typography.Text type="secondary">chưa gán đơn vị nào</Typography.Text>
              : <Space size={4} wrap>
                  {ds.map((d) => <Tag key={d.tenantId}>{d.code} · {d.role}</Tag>)}
                </Space> },
          { title: "", width: 260,
            render: (_: unknown, r: AdminUser) => (
              <Space size={4}>
                <Button size="small" disabled={!laAdmin}
                        onClick={() => { setUserDangSua(r); setMkMoi(""); }}>
                  Quyền / Mật khẩu
                </Button>
                <Popconfirm
                  title={r.isActive ? `Khóa ${r.loginName}?` : `Mở khóa ${r.loginName}?`}
                  description={r.isActive
                    ? "Người này sẽ không đăng nhập mới được nữa."
                    : "Người này đăng nhập lại được ngay."}
                  okText="Đồng ý" cancelText="Thôi"
                  onConfirm={() => doiTrangThai(r)}
                  disabled={!laAdmin}
                >
                  <Button size="small" danger={r.isActive} disabled={!laAdmin}>
                    {r.isActive ? "Khóa" : "Mở"}
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={`Xóa hẳn tài khoản ${r.loginName}?`}
                  description={
                    <div style={{ maxWidth: 320 }}>
                      Không khôi phục được. Nhật ký hoạt động cũ vẫn giữ nguyên.<br />
                      Nếu chỉ muốn chặn người này đăng nhập thì dùng <b>Khóa</b> — giữ
                      được quyền và lịch sử, mở lại lúc nào cũng được.
                    </div>
                  }
                  okText="Xóa hẳn" okButtonProps={{ danger: true }} cancelText="Thôi"
                  onConfirm={() => xoaUser(r)}
                  disabled={!laAdmin}
                >
                  <Button size="small" danger disabled={!laAdmin}>Xóa</Button>
                </Popconfirm>
              </Space>
            ) },
        ]}
      />

      {/* ---------- Thêm người dùng ---------- */}
      <Modal title="Thêm người dùng" open={moTao} onCancel={() => setMoTao(false)}
             onOk={() => formTao.submit()} confirmLoading={dangLuu}
             okText="Tạo" cancelText="Thôi">
        <Form form={formTao} layout="vertical" onFinish={taoUser}
              initialValues={{ role: "accountant", isAdmin: false }}>
          <Form.Item name="loginName" label="Tên đăng nhập"
                     rules={[{ required: true, min: 3, message: "Tối thiểu 3 ký tự" }]}>
            <Input placeholder="ketoan03" />
          </Form.Item>
          <Form.Item name="realName" label="Họ tên"><Input /></Form.Item>
          <Form.Item name="matKhau" label="Mật khẩu ban đầu"
                     extra="Tối thiểu 8 ký tự và có ít nhất một chữ số. Người dùng bị bắt đổi ở lần đăng nhập đầu."
                     rules={[{ required: true, min: 8, message: "Tối thiểu 8 ký tự" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="tenantId" label="Cho vào đơn vị (có thể gán sau)">
            <Select allowClear showSearch optionFilterProp="label"
                    options={tenants.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))} />
          </Form.Item>
          <Form.Item name="role" label="Vai trò trong đơn vị đó">
            <Select options={VAI_TRO} />
          </Form.Item>
          <Form.Item name="isAdmin" label="Quản trị viên toàn hệ thống" valuePropName="checked"
                     extra="Bật là vào được mọi đơn vị và làm được mọi việc quản trị — cân nhắc kỹ.">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---------- Quyền + đặt lại mật khẩu của một user ---------- */}
      <Modal title={`Quyền & mật khẩu — ${userHienTai?.loginName ?? ""}`}
             open={!!userDangSua} onCancel={() => setUserDangSua(null)}
             footer={null} width={640}>
        {userHienTai && (
          <>
            <Typography.Text strong>Đơn vị đang được vào</Typography.Text>
            {userHienTai.donVi.length === 0
              ? <Typography.Paragraph type="secondary">Chưa gán đơn vị nào.</Typography.Paragraph>
              : <Table
                  className="luoi-gon" size="small" rowKey="tenantId" pagination={false}
                  style={{ margin: "8px 0 16px" }}
                  dataSource={userHienTai.donVi}
                  columns={[
                    { title: "Đơn vị", dataIndex: "code", width: 160 },
                    { title: "Vai trò", dataIndex: "role" },
                    { title: "", width: 80, render: (_: unknown, d) => (
                        <Popconfirm title={`Gỡ quyền khỏi ${d.code}?`}
                                    okText="Gỡ" cancelText="Thôi"
                                    onConfirm={() => capQuyen(d.tenantId, null)}>
                          <Button size="small" danger>Gỡ</Button>
                        </Popconfirm>
                      ) },
                  ]}
                />}

            <Typography.Text strong>Cấp quyền vào đơn vị</Typography.Text>
            <Form form={formQuyen} layout="inline" style={{ margin: "8px 0 20px" }}
                  initialValues={{ role: "accountant" }}
                  onFinish={(v) => capQuyen(v.tenantId, v.role)}>
              <Form.Item name="tenantId" rules={[{ required: true, message: "Chọn đơn vị" }]}>
                <Select style={{ width: 260 }} showSearch optionFilterProp="label"
                        placeholder="Chọn đơn vị"
                        options={tenants.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))} />
              </Form.Item>
              <Form.Item name="role">
                <Select style={{ width: 170 }} options={VAI_TRO} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">Cấp</Button>
              </Form.Item>
            </Form>

            <Typography.Text strong>Đặt lại mật khẩu</Typography.Text>
            <Space style={{ marginTop: 8 }}>
              <Input.Password style={{ width: 260 }} value={mkMoi}
                              placeholder="Mật khẩu mới (≥8 ký tự, có số)"
                              onChange={(e) => setMkMoi(e.target.value)} />
              <Popconfirm title={`Đặt lại mật khẩu cho ${userHienTai.loginName}?`}
                          description="Người dùng sẽ bị bắt đổi ở lần đăng nhập tới."
                          okText="Đặt lại" cancelText="Thôi" onConfirm={datLaiMatKhau}>
                <Button danger disabled={mkMoi.length < 8}>Đặt lại</Button>
              </Popconfirm>
            </Space>
          </>
        )}
      </Modal>
    </Card>
  );
}
