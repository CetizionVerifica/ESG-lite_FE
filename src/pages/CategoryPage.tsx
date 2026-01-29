import { useActionState, useState, useEffect } from "react";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../services/categoryService";

interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

const CategoryPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const category_name = data.get("category_name");
        const scope = data.get("scope");

        const newCategory = await createCategory({
          category_name,
          scope,
        });

        setCategories((prev) => [...prev, newCategory.category || newCategory]);
        handleLoadCategories();
        setModalOpen(false);
      } catch (error) {
        console.log(error);
      }
    },
    null,
  );

  useEffect(() => {
    handleLoadCategories();
  }, []);

  const handleLoadCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories();

      setCategories(data);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (row: Category, updates: Partial<Category>) => {
    try {
      await updateCategory(row.category_id, updates);
      setCategories((prev) =>
        prev.map((item) =>
          item.category_id === row.category_id ? { ...item, ...updates } : item,
        ),
      );
    } catch (error) {
      console.error("Error updating category:", error);
      throw error;
    }
  };

  const handleDelete = async (row: Category) => {
    try {
      await deleteCategory(row.category_id);
      setCategories((prev) =>
        prev.filter((item) => item.category_id !== row.category_id),
      );
    } catch (error) {
      console.error("Error deleting category:", error);
      throw error;
    }
  };

  const columns: Column<Category>[] = [
    {
      key: "category_id",
      label: "ID",
      editable: false,
    },
    {
      key: "category_name",
      label: "Category Name",
      editable: true,
      type: "text",
    },
    {
      key: "scope",
      label: "Scope",
      editable: true,
      type: "text",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Category
          </button>
        </div>
      </div>

      <Modal
        title="Add Category"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Category Name
            </label>
            <input
              type="text"
              name="category_name"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Scope</label>
            <input
              type="text"
              name="scope"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mr-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Table<Category>
        data={categories}
        columns={columns}
        keyField="category_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />
    </div>
  );
};

export default CategoryPage;
