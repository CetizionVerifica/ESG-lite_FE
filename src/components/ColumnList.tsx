import { useState, useEffect, useCallback } from "react";
import {
  getColumns,
  deleteColumn,
  updateColumn,
} from "../services/columnService";
import { Table, Column } from "./Table";
import { DropdownOption } from "./Dropdown";

interface ColumnEntity {
  pk_id: number;
  column_name: string;
  column_type: string;
}

interface ColumnListProps {
  refreshTrigger?: number;
}

const COLUMN_TYPE_OPTIONS: DropdownOption[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "select", label: "Select" },
];

const ColumnList = ({ refreshTrigger }: ColumnListProps) => {
  const [columns, setColumns] = useState<ColumnEntity[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getColumns();
      setColumns(data);
    } catch (error) {
      console.error("Error loading columns:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleEdit = async (
    row: ColumnEntity,
    updates: Partial<ColumnEntity>
  ) => {
    try {
      await updateColumn(row.pk_id, updates);
      setColumns((prev) =>
        prev.map((item) =>
          item.pk_id === row.pk_id ? { ...item, ...updates } : item
        )
      );
    } catch (error) {
      console.error("Error updating column:", error);
      throw error;
    }
  };

  const handleDelete = async (row: ColumnEntity) => {
    try {
      await deleteColumn(row.pk_id);
      setColumns((prev) => prev.filter((item) => item.pk_id !== row.pk_id));
    } catch (error) {
      console.error("Error deleting column:", error);
      throw error;
    }
  };

  const tableColumns: Column<ColumnEntity>[] = [
    {
      key: "pk_id",
      label: "ID",
      editable: false,
    },
    {
      key: "column_name",
      label: "Column Name",
      editable: true,
      type: "text",
    },
    {
      key: "column_type",
      label: "Column Type",
      editable: true,
      type: "dropdown",
      options: COLUMN_TYPE_OPTIONS,
    },
  ];

  return (
    <Table<ColumnEntity>
      data={columns}
      columns={tableColumns}
      keyField="pk_id"
      onEdit={handleEdit}
      onDelete={handleDelete}
      loading={loading}
      showActions={true}
    />
  );
};

export default ColumnList;
