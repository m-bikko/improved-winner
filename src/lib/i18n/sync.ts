import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUserId } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/i18n'
import { isLang, type Lang } from '@/lib/i18n/lang'

/**
 * Подтягивает язык из профиля.
 *
 * Профиль главнее localStorage: он свой у каждого и переезжает на другое
 * устройство. localStorage нужен только затем, чтобы экран входа не ждал
 * сеть ради заголовка, - и после загрузки профиля он подтягивается к нему.
 */
export function useSyncLang(profileLang: string | undefined): void {
  const { lang, setLang } = useLang()
  useEffect(() => {
    if (isLang(profileLang) && profileLang !== lang) setLang(profileLang)
  }, [profileLang, lang, setLang])
}

export function useSaveLang() {
  const qc = useQueryClient()
  const userId = useUserId()
  const { setLang } = useLang()
  return useMutation({
    mutationFn: async (next: Lang) => {
      // Меняем сразу, не дожидаясь сети: язык интерфейса должен
      // переключаться по нажатию, а не по ответу сервера
      setLang(next)
      const { error } = await supabase
        .from('profiles')
        .update({ language: next })
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}
