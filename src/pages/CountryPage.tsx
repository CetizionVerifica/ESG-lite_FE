import { useActionState, useCallback, useEffect, useState } from "react";
import CountryList from "../components/CountryList";
import Modal from "../components/Modal";
import api from "../api/axios";
import { getCountries } from "../services/countryService";

const CountryPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [countryList, setCountryList] = useState<any[]>([]);
  const [_fomrState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const name = data.get("name");
        const code = data.get("code");
        await api.post("/admin/countries", {
          name,
          code,
        });
        setModalOpen(false);
        setCountryList(await fetchCountryList());
      } catch (error) {
        console.log(error);
      }
    },
    null,
  );

  const fetchCountryList = useCallback(async () => {
    const countries = await getCountries();
    setCountryList(countries);
    return countries;
  }, []);

  useEffect(() => {
    fetchCountryList();
  }, [fetchCountryList]);

  return (
    <div>
      <button onClick={() => setModalOpen(true)}>Add Country</button>
      <Modal
        title="Add Country"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Country Name
            </label>
            <input
              type="text"
              name="name"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Country Code
            </label>
            <input
              type="text"
              name="code"
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
      <CountryList list={countryList} />
    </div>
  );
};

export default CountryPage;
