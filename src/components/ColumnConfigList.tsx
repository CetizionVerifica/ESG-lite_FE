import { useState, useEffect, useCallback } from "react";
import {
  getColumnConfigs,
  getColumnConfigsBySite,
  getColumnConfigsBySiteAndCategory,
  deleteColumnConfig,
  updateColumnConfig,
} from "../services/columnConfigService";
import { getColumns } from "../services/columnService";
import { Table, Column } from "./Table";
import { DropdownOption } from "./Dropdown";

interface ColumnEntity {
  pk_id: number;
  column_name: string;
  column_type: string;
}

interface Site {
  site_id: number;
  name: string;
}

interface Category {
  category_id: number;
  category_name: string;
}

interface ColumnConfigEntity {
  pk_id: number;
  config_name: string;
  site: Site;
  category: Category;
  columns: ColumnEntity[];
}

interface ColumnConfigListProps {
  refreshTrigger?: number;
  siteId?: number | null;
  categoryId?: number | null;
}

const ColumnConfigList = ({
  refreshTrigger,
  siteId,
  categoryId,
}: ColumnConfigListProps) => {
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfigEntity[]>([]);
  const [allColumns, setAllColumns] = useState<ColumnEntity[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let data;
      if (siteId && categoryId) {
        data = await getColumnConfigsBySiteAndCategory(siteId, categoryId);
      } else if (siteId) {
        data = await getColumnConfigsBySite(siteId);
      } else {
        data = await getColumnConfigs();
      }
      setColumnConfigs(data);

      // Load all available columns for the dropdown
      const columnsData = await getColumns();
      setAllColumns(columnsData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [siteId, categoryId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

const handleEdit = async (
  row: ColumnConfigEntity,
  updates: Partial<ColumnConfigEntity>,
) => {
  try {
    const updatePayload: any = {
      config_name: updates.config_name,
    };

    // If columns were updated, they come as an array of IDs from the multiselect
    if (updates.columns !== undefined) {
      // When editing multiselect, the value is already an array of IDs
      const columnIds = Array.isArray(updates.columns)
        ? (updates.columns as any)
        : [];
      updatePayload.column_ids = columnIds;
    }

    await updateColumnConfig(row.pk_id, updatePayload);

    // Fetch the updated config to get the full column objects
    const columnsData = await getColumns();
    setAllColumns(columnsData);

    // Build the proper updates with full column objects instead of just IDs
    const properUpdates: Partial<ColumnConfigEntity> = {
      config_name: updates.config_name,
    };

    if (updates.columns !== undefined) {
      const columnIds = Array.isArray(updates.columns)
        ? (updates.columns as unknown as number[])
        : [];
      // Map IDs back to full column objects
      properUpdates.columns = columnIds
        .map((id) => columnsData.find((col: ColumnEntity) => col.pk_id === id))
        .filter((col): col is ColumnEntity => col !== undefined);
    }

    setColumnConfigs((prev) =>
      prev.map((item) =>
        item.pk_id === row.pk_id ? { ...item, ...properUpdates } : item,
      ),
    );
  } catch (error) {
    console.error("Error updating column config:", error);
    throw error;
  }
};

  const handleDelete = async (row: ColumnConfigEntity) => {
    try {
      await deleteColumnConfig(row.pk_id);
      setColumnConfigs((prev) =>
        prev.filter((item) => item.pk_id !== row.pk_id),
      );
    } catch (error) {
      console.error("Error deleting column config:", error);
      throw error;
    }
  };

  const columnOptions: DropdownOption[] = allColumns.map((column) => ({
    id: column.pk_id,
    label: column.column_name,
  }));

  const tableColumns: Column<ColumnConfigEntity>[] = [
    {
      key: "pk_id",
      label: "ID",
      editable: false,
    },
    {
      key: "config_name",
      label: "Config Name",
      editable: true,
      type: "text",
    },
    {
      key: "site",
      label: "Site",
      editable: false,
      render: (_value, row) => row.site?.name || "N/A",
    },
    {
      key: "category",
      label: "Category",
      editable: false,
      render: (_value, row) => row.category?.category_name || "N/A",
    },
    {
      key: "columns",
      label: "Columns",
      editable: true,
      type: "multiselect",
      options: columnOptions,
      render: (_value, row) => {
        if (!row.columns || row.columns.length === 0) return "N/A";
        return row.columns.map((col) => col.column_name).join(", ");
      },
    },
  ];

  return (
    <Table<ColumnConfigEntity>
      data={columnConfigs}
      columns={tableColumns}
      keyField="pk_id"
      onEdit={handleEdit}
      onDelete={handleDelete}
      loading={loading}
      showActions={true}
    />
  );
};

export default ColumnConfigList;
